#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, link, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  INSTALL_LOCK_FILE,
  INSTALL_LOCK_INITIALIZATION_STALE_MS,
  INSTALL_LOCK_RECOVERY_FILE,
  ROOT_END,
  ROOT_START,
  STATE_FILE,
  atomicWrite,
  doctorDistribution,
  installDistribution,
  uninstallDistribution,
  validateRetiredManagedPaths,
} from './install-distribution.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDistribution = path.join(repo, 'dist');
const execFile = promisify(execFileCallback);
const sha256 = (content) => createHash('sha256').update(content).digest('hex');
const validHash = sha256('valid');
const hasPathSuffix = (file, relative) => {
  const normalize = (value) => value.replaceAll('\\', '/').replaceAll(/\/+$/g, '');
  const candidate = normalize(path.resolve(file));
  const suffix = normalize(relative);
  const left = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  const right = process.platform === 'win32' ? suffix.toLowerCase() : suffix;
  return left === right || left.endsWith(`/${right}`);
};

const exists = async (file) => {
  try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};

const text = (file) => readFile(file, 'utf8');

async function waitForFile(file, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await exists(file)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function snapshot(root, directory = root, result = {}) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await snapshot(root, file, result);
    else result[path.relative(root, file).split(path.sep).join('/')] = (await readFile(file)).toString('base64');
  }
  return result;
}

async function stageUpgradeFixtures(root, distributionRoot) {
  const v1 = path.join(root, 'distribution-v1');
  const v2 = path.join(root, 'distribution-v2');
  await cp(distributionRoot, v1, { recursive: true });
  await cp(v1, v2, { recursive: true });
  const sharedRetired = 'agent-rules/reference/lifecycle-retired-fixture.md';
  const claudeRetired = '.claude/rules/core-retired-fixture.md';
  const added = 'agent-rules/reference/lifecycle-added-fixture.md';
  for (const host of ['claude', 'codex']) {
    const rootName = host === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
    await writeFile(path.join(v1, host, ...sharedRetired.split('/')), '# Retired fixture\n');
    await writeFile(path.join(v2, host, ...added.split('/')), '# Added fixture\n');
    const rootFile = path.join(v2, host, rootName);
    const upgraded = (await text(rootFile)).replace(/^# /, '# Updated ');
    assert.notEqual(upgraded, await text(rootFile));
    await writeFile(rootFile, upgraded);
    const principles = path.join(v2, host, 'agent-rules', 'reference', 'principles.md');
    await writeFile(principles, `${await text(principles)}\n<!-- lifecycle-v2 -->\n`);
  }
  await writeFile(path.join(v1, 'claude', ...claudeRetired.split('/')), '# Retired Claude fixture\n');
  return {
    v1,
    v2,
    sharedRetired,
    claudeRetired,
    added,
    retiredManagedPaths: {
      claude: [sharedRetired, claudeRetired],
      codex: [sharedRetired],
    },
  };
}

function leaseOwner(overrides = {}) {
  return {
    schemaVersion: 1,
    hostname: hostname(),
    pid: process.pid,
    nonce: '00000000-0000-4000-8000-000000000000',
    createdAtMs: Date.now(),
    ...overrides,
  };
}

export async function runInstallLifecycleTests({ distributionRoot = defaultDistribution } = {}) {
  const temporary = await mkdtemp(path.join(tmpdir(), 'aer-install-test-'));
  try {
    const atomicTarget = path.join(temporary, 'atomic-target.md');
    const atomicAlias = path.join(temporary, 'atomic-alias.md');
    await writeFile(atomicTarget, 'original\n');
    await link(atomicTarget, atomicAlias);
    await atomicWrite(atomicTarget, 'replacement\n');
    assert.equal(await text(atomicTarget), 'replacement\n');
    assert.equal(await text(atomicAlias), 'original\n', 'atomic replacement must not mutate a host-owned hard link');
    await assert.rejects(
      atomicWrite(atomicTarget, 'failed\n', { rename: async () => { throw new Error('injected rename failure'); } }),
      /injected rename failure/,
    );
    assert.equal(await text(atomicTarget), 'replacement\n');

    await assert.rejects(
      installDistribution({ targetRoot: path.join(repo, 'dist'), distributionRoot, hosts: ['codex'], log: false }),
      (error) => error.code === 'TARGET' && /source repository or one of its descendants/.test(error.message),
    );
    assert.deepEqual(validateRetiredManagedPaths(), {
      claude: ['agent-rules/tools/file-size-guard.py', 'agent-rules/tools/slop-scan.sh'],
      codex: ['agent-rules/tools/file-size-guard.py', 'agent-rules/tools/slop-scan.sh'],
    });
    for (const invalid of [
      { claude: ['../escape'], codex: [] },
      { claude: ['.claude/settings.json'], codex: [] },
      { claude: [], codex: [], constructor: [] },
      { claude: ['agent-rules/CONOUT$/file.md'], codex: [] },
    ]) {
      assert.throws(() => validateRetiredManagedPaths(invalid));
    }

    const invalidState = path.join(temporary, 'invalid-state');
    await mkdir(invalidState);
    await writeFile(path.join(invalidState, STATE_FILE), `${JSON.stringify({
      schemaVersion: 3,
      hosts: {
        codex: {
          profile: 'standard',
          contexts: [],
          root: { path: 'AGENTS.md', sha256: validHash, createdFile: false, prependedSeparator: false },
          files: { 'agent-rules/..\\package.json': validHash },
        },
      },
    })}\n`);
    const invalidBefore = await snapshot(invalidState);
    await assert.rejects(
      installDistribution({ targetRoot: invalidState, distributionRoot, hosts: ['codex'], log: false }),
      (error) => error.code === 'INVALID_STATE' && /unsafe owned path/.test(error.message),
    );
    assert.deepEqual(await snapshot(invalidState), invalidBefore);
    assert.equal((await doctorDistribution({ targetRoot: invalidState, distributionRoot })).status, 'invalid');

    const closedStateBase = {
      schemaVersion: 3,
      hosts: {
        codex: {
          profile: 'standard',
          contexts: [],
          root: { path: 'AGENTS.md', sha256: validHash, createdFile: false, prependedSeparator: false },
          files: {},
        },
      },
    };
    const invalidClosedStates = [
      { ...closedStateBase, unexpected: true },
      { ...closedStateBase, hosts: { codex: { ...closedStateBase.hosts.codex, contexts: ['backend-api', 'backend-api'] } } },
      {
        ...closedStateBase,
        hosts: {
          codex: {
            ...closedStateBase.hosts.codex,
            root: { ...closedStateBase.hosts.codex.root, unexpected: true },
          },
        },
      },
    ];
    for (const [index, invalidLedger] of invalidClosedStates.entries()) {
      const target = path.join(temporary, `closed-state-${index}`);
      await mkdir(target);
      await writeFile(path.join(target, STATE_FILE), `${JSON.stringify(invalidLedger)}\n`);
      const health = await doctorDistribution({ targetRoot: target, distributionRoot });
      assert.equal(health.status, 'invalid', `closed state variant ${index} must be invalid`);
      await assert.rejects(
        installDistribution({ targetRoot: target, distributionRoot, hosts: ['codex'], log: false }),
        (error) => error.code === 'INVALID_STATE',
      );
    }

    const { v1, v2, sharedRetired, claudeRetired, added, retiredManagedPaths } = await stageUpgradeFixtures(temporary, distributionRoot);

    const collision = path.join(temporary, 'identical-collision');
    await mkdir(path.join(collision, 'agent-rules', 'reference'), { recursive: true });
    await cp(
      path.join(v1, 'codex', 'agent-rules', 'reference', 'principles.md'),
      path.join(collision, 'agent-rules', 'reference', 'principles.md'),
    );
    const collisionBefore = await snapshot(collision);
    await assert.rejects(
      installDistribution({ targetRoot: collision, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
      (error) => error.code === 'PREFLIGHT' && /identical unowned collision/.test(error.message),
    );
    assert.deepEqual(await snapshot(collision), collisionBefore);

    const markerCollision = path.join(temporary, 'marker-collision');
    await mkdir(markerCollision);
    await writeFile(path.join(markerCollision, 'AGENTS.md'), `${ROOT_START}\nnot owned\n${ROOT_END}\n`);
    const markerBefore = await snapshot(markerCollision);
    await assert.rejects(
      installDistribution({ targetRoot: markerCollision, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
      (error) => error.code === 'PREFLIGHT' && /pre-existing managed markers/.test(error.message),
    );
    assert.deepEqual(await snapshot(markerCollision), markerBefore);

    const unmarkedCollision = path.join(temporary, 'unmarked-root-collision');
    await mkdir(unmarkedCollision);
    await cp(path.join(v1, 'codex', 'AGENTS.md'), path.join(unmarkedCollision, 'AGENTS.md'));
    const unmarkedBefore = await snapshot(unmarkedCollision);
    await assert.rejects(
      installDistribution({ targetRoot: unmarkedCollision, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
      (error) => error.code === 'PREFLIGHT' && /exact unmarked generated root payload is unowned/.test(error.message),
    );
    assert.deepEqual(await snapshot(unmarkedCollision), unmarkedBefore);

    const emptyLedger = path.join(temporary, 'empty-ledger');
    await mkdir(emptyLedger);
    await writeFile(path.join(emptyLedger, STATE_FILE), `${JSON.stringify({ schemaVersion: 3, hosts: {} })}\n`);
    const emptyLedgerBefore = await snapshot(emptyLedger);
    await assert.rejects(
      installDistribution({ targetRoot: emptyLedger, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
      (error) => error.code === 'ALREADY_INITIALIZED' && /already exists/.test(error.message),
    );
    assert.deepEqual(await snapshot(emptyLedger), emptyLedgerBefore);

    const host = path.join(temporary, 'lifecycle-host');
    await mkdir(host);
    const claudePrefix = '# Project Claude instructions\n\nPreserve this prefix.\n';
    const codexPrefix = '# Project Codex instructions\n\nPreserve this prefix.\n';
    await writeFile(path.join(host, 'CLAUDE.md'), claudePrefix);
    await writeFile(path.join(host, 'AGENTS.md'), codexPrefix);
    await installDistribution({
      targetRoot: host,
      distributionRoot: v1,
      hosts: ['claude', 'codex'],
      mode: 'init',
      log: false,
    });
    const firstState = JSON.parse(await text(path.join(host, STATE_FILE)));
    assert.equal(firstState.schemaVersion, 3);
    assert.equal(firstState.hosts.claude.profile, 'standard');
    assert.deepEqual(firstState.hosts.codex.contexts, []);
    assert.match(firstState.hosts.claude.root.sha256, /^[a-f0-9]{64}$/);
    assert.match(firstState.hosts.codex.root.sha256, /^[a-f0-9]{64}$/);
    assert.equal(await exists(path.join(host, '.claude', 'rules', 'context-backend-api.md')), false, 'fresh contexts default to none');
    assert.equal((await doctorDistribution({ targetRoot: host, distributionRoot: v1 })).status, 'current');
    const firstSnapshot = await snapshot(host);
    await installDistribution({ targetRoot: host, distributionRoot: v1, hosts: ['claude', 'codex'], mode: 'update', log: false });
    assert.deepEqual(await snapshot(host), firstSnapshot, 'same-version update must be byte-idempotent');
    await assert.rejects(
      installDistribution({ targetRoot: host, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
      (error) => error.code === 'ALREADY_INITIALIZED',
    );

    const portableLineEndings = path.join(temporary, 'portable-line-endings');
    await mkdir(portableLineEndings);
    const portableHostPrefix = '# Host survives clone\n';
    await writeFile(path.join(portableLineEndings, 'AGENTS.md'), portableHostPrefix);
    await installDistribution({
      targetRoot: portableLineEndings,
      distributionRoot: v1,
      hosts: ['codex'],
      mode: 'init',
      log: false,
    });
    const portableState = JSON.parse(await text(path.join(portableLineEndings, STATE_FILE)));
    const portablePaths = new Set([
      ...Object.keys(portableState.hosts.codex.files),
      portableState.hosts.codex.root.path,
      STATE_FILE,
    ]);
    for (const relative of portablePaths) {
      const file = path.join(portableLineEndings, ...relative.split('/'));
      await writeFile(file, (await text(file)).replace(/\r?\n/g, '\r\n'));
    }
    assert.equal(
      (await doctorDistribution({ targetRoot: portableLineEndings, distributionRoot: v1 })).status,
      'current',
      'Git CRLF checkout conversion must preserve ownership',
    );
    const portableOwned = [...Object.keys(portableState.hosts.codex.files)][0];
    const portableOwnedPath = path.join(portableLineEndings, ...portableOwned.split('/'));
    const portableOwnedText = await text(portableOwnedPath);
    await writeFile(portableOwnedPath, `${portableOwnedText}semantic tamper\r\n`);
    assert.equal(
      (await doctorDistribution({ targetRoot: portableLineEndings, distributionRoot: v1 })).status,
      'drift',
      'line-ending portability must not hide semantic edits',
    );
    await writeFile(portableOwnedPath, portableOwnedText);
    await installDistribution({ targetRoot: portableLineEndings, distributionRoot: v1, mode: 'update', log: false });
    await uninstallDistribution({ targetRoot: portableLineEndings, distributionRoot: v1, log: false });
    assert.equal(await text(path.join(portableLineEndings, 'AGENTS.md')), portableHostPrefix.replace(/\n/g, '\r\n'));
    assert.equal(await exists(portableOwnedPath), false);
    assert.equal(await exists(path.join(portableLineEndings, STATE_FILE)), false);

    for (const [name, original] of [['missing', null], ['empty', ''], ['blank', '\n'], ['lone-cr', '# Host\r'], ['unterminated', '# Host']]) {
      const rootProvenance = path.join(temporary, `root-provenance-${name}`);
      await mkdir(rootProvenance);
      if (original !== null) await writeFile(path.join(rootProvenance, 'AGENTS.md'), original);
      await installDistribution({ targetRoot: rootProvenance, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
      const rootState = JSON.parse(await text(path.join(rootProvenance, STATE_FILE))).hosts.codex.root;
      assert.equal(rootState.createdFile, original === null);
      assert.equal(rootState.prependedSeparator, original !== null && !/(?:\r\n|\r|\n)$/.test(original));
      await uninstallDistribution({ targetRoot: rootProvenance, distributionRoot: v1, log: false });
      assert.equal(await exists(path.join(rootProvenance, 'AGENTS.md')), original !== null);
      if (original !== null) assert.equal(await text(path.join(rootProvenance, 'AGENTS.md')), original);
    }

    const interruptedFreshRoot = path.join(temporary, 'interrupted-fresh-root');
    await mkdir(interruptedFreshRoot);
    let freshCheckpointWritten = false;
    await assert.rejects(
      installDistribution({
        targetRoot: interruptedFreshRoot,
        distributionRoot: v1,
        hosts: ['codex'],
        mode: 'init',
        operations: {
          atomicWrite: async (file, content) => {
            await atomicWrite(file, content);
            if (!freshCheckpointWritten && path.basename(file) === STATE_FILE) {
              freshCheckpointWritten = true;
              throw new Error('injected interruption after fresh checkpoint');
            }
          },
        },
        log: false,
      }),
      /injected interruption after fresh checkpoint/,
    );
    const interruptedFreshState = JSON.parse(await text(path.join(interruptedFreshRoot, STATE_FILE)));
    assert.equal(interruptedFreshState.pending.codex.root.createdFile, true, 'fresh checkpoint initially plans to create the root');
    assert.equal(await exists(path.join(interruptedFreshRoot, 'AGENTS.md')), false);
    await writeFile(path.join(interruptedFreshRoot, 'AGENTS.md'), '');
    await installDistribution({
      targetRoot: interruptedFreshRoot,
      distributionRoot: v1,
      hosts: ['codex'],
      mode: 'update',
      log: false,
    });
    const recomputedFreshRoot = JSON.parse(await text(path.join(interruptedFreshRoot, STATE_FILE))).hosts.codex.root;
    assert.equal(recomputedFreshRoot.createdFile, false, 'retry must recompute ownership after a user creates the root');
    assert.equal(recomputedFreshRoot.prependedSeparator, true, 'empty host roots require and own one prepended separator');
    await uninstallDistribution({ targetRoot: interruptedFreshRoot, distributionRoot: v1, log: false });
    assert.equal(await exists(path.join(interruptedFreshRoot, 'AGENTS.md')), true);
    assert.equal(await text(path.join(interruptedFreshRoot, 'AGENTS.md')), '', 'uninstall must preserve the user-created empty root');

    const movedBoundaryHost = path.join(temporary, 'moved-root-boundary');
    await mkdir(movedBoundaryHost);
    await writeFile(path.join(movedBoundaryHost, 'AGENTS.md'), '# Unterminated host prose');
    await installDistribution({ targetRoot: movedBoundaryHost, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
    const movedRootPath = path.join(movedBoundaryHost, 'AGENTS.md');
    const installedMovedRoot = await text(movedRootPath);
    const markerStart = installedMovedRoot.indexOf(ROOT_START);
    const markerEnd = installedMovedRoot.indexOf(ROOT_END) + ROOT_END.length;
    assert.ok(markerStart > 0 && markerEnd > markerStart);
    let blockEnd = markerEnd;
    if (installedMovedRoot.startsWith('\r\n', blockEnd)) blockEnd += 2;
    else if (installedMovedRoot.startsWith('\n', blockEnd)) blockEnd += 1;
    const movedBlock = `${installedMovedRoot.slice(markerStart, blockEnd)}${installedMovedRoot.slice(0, markerStart)}`;
    await writeFile(movedRootPath, movedBlock);
    const movedSnapshot = await snapshot(movedBoundaryHost);
    const movedHealth = await doctorDistribution({ targetRoot: movedBoundaryHost, distributionRoot: v1 });
    assert.equal(movedHealth.status, 'drift');
    assert.ok(movedHealth.issues.some((issue) => issue.code === 'MODIFIED_ROOT' && /separator/.test(issue.message)));
    await assert.rejects(
      installDistribution({ targetRoot: movedBoundaryHost, distributionRoot: v1, hosts: ['codex'], mode: 'update', log: false }),
      (error) => error.code === 'PREFLIGHT' && /separator before the managed block/.test(error.message),
    );
    assert.deepEqual(await snapshot(movedBoundaryHost), movedSnapshot);
    await assert.rejects(
      uninstallDistribution({ targetRoot: movedBoundaryHost, distributionRoot: v1, log: false }),
      (error) => error.code === 'ROOT_SEPARATOR_MODIFIED',
    );
    assert.deepEqual(await snapshot(movedBoundaryHost), movedSnapshot);
    const preservedMoved = await uninstallDistribution({
      targetRoot: movedBoundaryHost,
      distributionRoot: v1,
      keepModified: true,
      log: false,
    });
    assert.ok(preservedMoved.preserved.some((entry) => entry.includes('AGENTS.md')));
    assert.equal(await text(movedRootPath), movedBlock, 'keepModified must preserve the relocated block byte-for-byte');
    assert.equal(await exists(path.join(movedBoundaryHost, STATE_FILE)), false, 'keepModified must disown the preserved root');

    const originalCodexRoot = await text(path.join(host, 'AGENTS.md'));
    const tamperedCodexRoot = originalCodexRoot.replace('## Agent Engineering Contract', '## Tampered Engineering Contract');
    assert.notEqual(tamperedCodexRoot, originalCodexRoot);
    await writeFile(path.join(host, 'AGENTS.md'), tamperedCodexRoot);
    const tamperedSnapshot = await snapshot(host);
    const tamperedDoctor = await doctorDistribution({ targetRoot: host, distributionRoot: v1 });
    assert.equal(tamperedDoctor.status, 'drift');
    assert.ok(tamperedDoctor.issues.some((issue) => issue.code === 'MODIFIED_ROOT'));
    await assert.rejects(
      installDistribution({ targetRoot: host, distributionRoot: v2, hosts: ['codex'], mode: 'update', retiredManagedPaths, log: false }),
      (error) => error.code === 'PREFLIGHT' && /managed root block differs/.test(error.message),
    );
    assert.deepEqual(await snapshot(host), tamperedSnapshot, 'root tampering must block the complete update atomically');
    await writeFile(path.join(host, 'AGENTS.md'), originalCodexRoot);

    await installDistribution({
      targetRoot: host,
      distributionRoot: v2,
      hosts: ['claude', 'codex'],
      mode: 'update',
      retiredManagedPaths,
      log: false,
    });
    assert.equal(await exists(path.join(host, ...sharedRetired.split('/'))), false);
    assert.equal(await exists(path.join(host, ...claudeRetired.split('/'))), false);
    assert.equal(await exists(path.join(host, ...added.split('/'))), true);
    assert.equal((await doctorDistribution({ targetRoot: host, distributionRoot: v2, retiredManagedPaths })).status, 'current');

    const noStateUpdate = path.join(temporary, 'no-state-update');
    await mkdir(noStateUpdate);
    await assert.rejects(
      installDistribution({ targetRoot: noStateUpdate, distributionRoot: v1, mode: 'update', log: false }),
      (error) => error.code === 'NOT_INITIALIZED',
    );

    const interrupted = path.join(temporary, 'interrupted-update');
    await mkdir(interrupted);
    await installDistribution({ targetRoot: interrupted, distributionRoot: v1, hosts: ['claude'], mode: 'init', log: false });
    await assert.rejects(
      installDistribution({
        targetRoot: interrupted,
        distributionRoot: v2,
        hosts: ['claude'],
        mode: 'update',
        retiredManagedPaths,
        operations: {
          atomicWrite: async (file, content) => {
            await atomicWrite(file, content);
            if (file.replaceAll('\\', '/').endsWith(added)) throw new Error('injected update interruption');
          },
        },
        log: false,
      }),
      /injected update interruption/,
    );
    const pendingState = JSON.parse(await text(path.join(interrupted, STATE_FILE)));
    assert.ok(pendingState.pending.claude.root.hashes.length >= 2, 'pending state must authorize old and new managed-root hashes');
    assert.equal((await doctorDistribution({ targetRoot: interrupted, distributionRoot: v2, retiredManagedPaths })).status, 'drift');
    const pendingBeforeUninstall = await snapshot(interrupted);
    await assert.rejects(
      uninstallDistribution({ targetRoot: interrupted, distributionRoot: v2, retiredManagedPaths, log: false }),
      (error) => error.code === 'PENDING_TRANSACTION' && /rerun aer update/.test(error.message),
    );
    assert.deepEqual(await snapshot(interrupted), pendingBeforeUninstall, 'uninstall must not discard interrupted-update authority');
    await installDistribution({
      targetRoot: interrupted,
      distributionRoot: v2,
      hosts: ['claude'],
      mode: 'update',
      retiredManagedPaths,
      log: false,
    });
    assert.equal(JSON.parse(await text(path.join(interrupted, STATE_FILE))).pending, undefined);
    assert.equal((await doctorDistribution({ targetRoot: interrupted, distributionRoot: v2, retiredManagedPaths })).status, 'current');

    const concurrentWriteHost = path.join(temporary, 'concurrent-write-host');
    await mkdir(concurrentWriteHost);
    await installDistribution({ targetRoot: concurrentWriteHost, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
    const concurrentWriteTarget = path.join(concurrentWriteHost, 'agent-rules', 'reference', 'principles.md');
    const concurrentWriteContent = '# Concurrent host edit after preflight\n';
    let concurrentWriteInjected = false;
    await assert.rejects(
      installDistribution({
        targetRoot: concurrentWriteHost,
        distributionRoot: v2,
        hosts: ['codex'],
        mode: 'update',
        retiredManagedPaths,
        operations: {
          atomicWrite: async (file, content) => {
            await atomicWrite(file, content);
            if (!concurrentWriteInjected && path.basename(file) === STATE_FILE) {
              await writeFile(concurrentWriteTarget, concurrentWriteContent);
              concurrentWriteInjected = true;
            }
          },
        },
        log: false,
      }),
      (error) => error.code === 'CONCURRENT_CHANGE' && /principles\.md changed after install preflight/.test(error.message),
    );
    assert.equal(concurrentWriteInjected, true);
    assert.equal(await text(concurrentWriteTarget), concurrentWriteContent, 'a mutation-time host edit must never be overwritten');
    assert.ok(JSON.parse(await text(path.join(concurrentWriteHost, STATE_FILE))).pending.codex, 'concurrent edit rejection retains the recovery journal');

    const concurrentDeleteHost = path.join(temporary, 'concurrent-delete-host');
    await mkdir(concurrentDeleteHost);
    await installDistribution({ targetRoot: concurrentDeleteHost, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
    const concurrentDeleteTarget = path.join(concurrentDeleteHost, ...sharedRetired.split('/'));
    const concurrentDeleteContent = '# Concurrent customization of retiring content\n';
    let concurrentDeleteInjected = false;
    await assert.rejects(
      installDistribution({
        targetRoot: concurrentDeleteHost,
        distributionRoot: v2,
        hosts: ['codex'],
        mode: 'update',
        retiredManagedPaths,
        operations: {
          atomicWrite: async (file, content) => {
            await atomicWrite(file, content);
            if (!concurrentDeleteInjected && path.basename(file) === STATE_FILE) {
              await writeFile(concurrentDeleteTarget, concurrentDeleteContent);
              concurrentDeleteInjected = true;
            }
          },
        },
        log: false,
      }),
      (error) => error.code === 'CONCURRENT_CHANGE' && /lifecycle-retired-fixture\.md changed after install preflight/.test(error.message),
    );
    assert.equal(concurrentDeleteInjected, true);
    assert.equal(await text(concurrentDeleteTarget), concurrentDeleteContent, 'a mutation-time edit must prevent retired-file deletion');

    const reentrantHost = path.join(temporary, 'same-process-reentrant-host');
    await mkdir(reentrantHost);
    await installDistribution({ targetRoot: reentrantHost, distributionRoot: v1, hosts: ['claude'], mode: 'init', log: false });
    let reentrantAttempted = false;
    await installDistribution({
      targetRoot: reentrantHost,
      distributionRoot: v1,
      hosts: ['claude'],
      mode: 'update',
      profile: 'prototype',
      operations: {
        atomicWrite: async (file, content) => {
          if (!reentrantAttempted && hasPathSuffix(file, '.claude/rules/profile.md')) {
            reentrantAttempted = true;
            await assert.rejects(
              installDistribution({
                targetRoot: reentrantHost,
                distributionRoot: v1,
                hosts: ['claude'],
                mode: 'update',
                profile: 'high-assurance',
                log: false,
              }),
              (error) => error.code === 'INSTALL_LOCKED' && /reentrant installation is not allowed/.test(error.message),
            );
          }
          await atomicWrite(file, content);
        },
      },
      log: false,
    });
    assert.equal(reentrantAttempted, true);
    const reentrantState = JSON.parse(await text(path.join(reentrantHost, STATE_FILE)));
    assert.equal(reentrantState.hosts.claude.profile, 'prototype');
    assert.equal(reentrantState.pending, undefined);
    assert.equal(await exists(path.join(reentrantHost, INSTALL_LOCK_FILE)), false);

    const sharedRetryDistribution = path.join(temporary, 'distribution-shared-retry');
    await cp(v1, sharedRetryDistribution, { recursive: true });
    for (const hostName of ['claude', 'codex']) {
      const shared = path.join(sharedRetryDistribution, hostName, 'agent-rules', 'reference', 'principles.md');
      await writeFile(shared, `${await text(shared)}\n<!-- interrupted-shared-update -->\n`);
    }
    const sharedRetryHost = path.join(temporary, 'shared-retry-host');
    await mkdir(sharedRetryHost);
    await installDistribution({ targetRoot: sharedRetryHost, distributionRoot: v1, hosts: ['claude', 'codex'], mode: 'init', log: false });
    const sharedRetryTarget = path.join(sharedRetryHost, 'agent-rules', 'reference', 'principles.md');
    await assert.rejects(
      installDistribution({
        targetRoot: sharedRetryHost,
        distributionRoot: sharedRetryDistribution,
        hosts: ['claude'],
        mode: 'update',
        operations: {
          atomicWrite: async (file, content) => {
            await atomicWrite(file, content);
            if (hasPathSuffix(file, 'agent-rules/reference/principles.md')) throw new Error('injected interruption after shared write');
          },
        },
        log: false,
      }),
      /injected interruption after shared write/,
    );
    const interruptedSharedState = JSON.parse(await text(path.join(sharedRetryHost, STATE_FILE)));
    assert.ok(interruptedSharedState.pending.claude.files['agent-rules/reference/principles.md']);
    await installDistribution({
      targetRoot: sharedRetryHost,
      distributionRoot: sharedRetryDistribution,
      hosts: ['claude'],
      mode: 'update',
      log: false,
    });
    const sharedRetryState = JSON.parse(await text(path.join(sharedRetryHost, STATE_FILE)));
    const installedSharedHash = sha256(await readFile(sharedRetryTarget));
    assert.equal(sharedRetryState.hosts.claude.files['agent-rules/reference/principles.md'], installedSharedHash);
    assert.equal(sharedRetryState.hosts.codex.files['agent-rules/reference/principles.md'], installedSharedHash, 'no-write retry repairs unselected shared ownership');
    assert.equal(sharedRetryState.pending, undefined);

    const modifiedUninstall = path.join(temporary, 'modified-uninstall');
    await mkdir(modifiedUninstall);
    await writeFile(path.join(modifiedUninstall, 'AGENTS.md'), '# Host Codex prose\n');
    await installDistribution({ targetRoot: modifiedUninstall, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
    const skill = Object.keys(JSON.parse(await text(path.join(modifiedUninstall, STATE_FILE))).hosts.codex.files)
      .find((file) => file.startsWith('.agents/skills/'));
    await writeFile(path.join(modifiedUninstall, ...skill.split('/')), 'project customization\n');
    const modifiedBefore = await snapshot(modifiedUninstall);
    await assert.rejects(
      uninstallDistribution({ targetRoot: modifiedUninstall, distributionRoot: v1, log: false }),
      (error) => error.code === 'PREFLIGHT' && /modified distribution-owned file/.test(error.message),
    );
    assert.deepEqual(await snapshot(modifiedUninstall), modifiedBefore, 'modified content must block uninstall before any mutation');
    const kept = await uninstallDistribution({ targetRoot: modifiedUninstall, distributionRoot: v1, keepModified: true, log: false });
    assert.ok(kept.preserved.some((entry) => entry.includes(skill)));
    assert.equal(await text(path.join(modifiedUninstall, ...skill.split('/'))), 'project customization\n');
    assert.equal(await exists(path.join(modifiedUninstall, STATE_FILE)), false);

    const partial = path.join(temporary, 'partial-uninstall');
    await mkdir(partial);
    const claudeHostText = '# Host Claude prose\n';
    const codexHostText = '# Host Codex prose\n';
    await writeFile(path.join(partial, 'CLAUDE.md'), claudeHostText);
    await writeFile(path.join(partial, 'AGENTS.md'), codexHostText);
    await installDistribution({ targetRoot: partial, distributionRoot: v1, hosts: ['claude', 'codex'], mode: 'init', log: false });
    const sharedFile = path.join(partial, 'agent-rules', 'reference', 'principles.md');
    await uninstallDistribution({ targetRoot: partial, distributionRoot: v1, hosts: ['codex'], log: false });
    const partialState = JSON.parse(await text(path.join(partial, STATE_FILE)));
    assert.deepEqual(Object.keys(partialState.hosts), ['claude']);
    assert.equal(await exists(sharedFile), true, 'shared files remain until their final host owner is removed');
    assert.doesNotMatch(await text(path.join(partial, 'AGENTS.md')), /agent-engineering-rules:start/);
    assert.match(await text(path.join(partial, 'AGENTS.md')), /Host Codex prose/);
    assert.match(await text(path.join(partial, 'CLAUDE.md')), /agent-engineering-rules:start/);
    await uninstallDistribution({ targetRoot: partial, distributionRoot: v1, log: false });
    assert.equal(await exists(path.join(partial, STATE_FILE)), false);
    assert.equal(await exists(sharedFile), false);
    assert.match(await text(path.join(partial, 'CLAUDE.md')), /Host Claude prose/);

    const interruptedUninstall = path.join(temporary, 'interrupted-uninstall');
    await mkdir(interruptedUninstall);
    await writeFile(path.join(interruptedUninstall, 'CLAUDE.md'), '# Host prose survives\n');
    await installDistribution({ targetRoot: interruptedUninstall, distributionRoot: v1, hosts: ['claude'], mode: 'init', log: false });
    await assert.rejects(
      uninstallDistribution({
        targetRoot: interruptedUninstall,
        distributionRoot: v1,
        operations: {
          atomicWrite: async (file, content) => {
            await atomicWrite(file, content);
            if (path.basename(file) === 'CLAUDE.md') throw new Error('injected uninstall interruption');
          },
        },
        log: false,
      }),
      /injected uninstall interruption/,
    );
    assert.equal(await exists(path.join(interruptedUninstall, STATE_FILE)), true, 'ownership state is committed last');
    assert.doesNotMatch(await text(path.join(interruptedUninstall, 'CLAUDE.md')), /agent-engineering-rules:start/);
    await uninstallDistribution({ targetRoot: interruptedUninstall, distributionRoot: v1, log: false });
    assert.equal(await exists(path.join(interruptedUninstall, STATE_FILE)), false);
    assert.match(await text(path.join(interruptedUninstall, 'CLAUDE.md')), /Host prose survives/);

    const activeLease = path.join(temporary, 'active-lease');
    await mkdir(activeLease);
    const leasePath = path.join(activeLease, INSTALL_LOCK_FILE);
    await writeFile(leasePath, `${JSON.stringify(leaseOwner())}\n`);
    const leaseBefore = await snapshot(activeLease);
    for (const dryRun of [false, true]) {
      await assert.rejects(
        installDistribution({ targetRoot: activeLease, distributionRoot: v1, hosts: ['codex'], dryRun, log: false }),
        (error) => error.code === 'INSTALL_LOCKED'
          && /alive same-host process/.test(error.message)
          && /remove it only after confirming that no installer is running/.test(error.message),
      );
      assert.deepEqual(await snapshot(activeLease), leaseBefore, 'active leases must fail without target mutation');
    }

    const oversizedLease = path.join(temporary, 'oversized-lease');
    await mkdir(oversizedLease);
    const oversizedLeasePath = path.join(oversizedLease, INSTALL_LOCK_FILE);
    await writeFile(oversizedLeasePath, 'x'.repeat(4097));
    const oversizedBefore = await snapshot(oversizedLease);
    await assert.rejects(
      installDistribution({ targetRoot: oversizedLease, distributionRoot: v1, hosts: ['codex'], log: false }),
      (error) => error.code === 'INSTALL_LOCK_UNSAFE' && /exceeds 4096 bytes/.test(error.message),
    );
    assert.deepEqual(await snapshot(oversizedLease), oversizedBefore, 'oversized leases require manual inspection and are preserved');

    const growingLease = path.join(temporary, 'growing-lease');
    await mkdir(growingLease);
    const growingLeasePath = path.join(growingLease, INSTALL_LOCK_FILE);
    await writeFile(growingLeasePath, `${JSON.stringify(leaseOwner())}\n`);
    let grewDuringRead = false;
    await assert.rejects(
      installDistribution({
        targetRoot: growingLease,
        distributionRoot: v1,
        hosts: ['codex'],
        operations: {
          beforeLeaseRead: async ({ lockPath }) => {
            if (!hasPathSuffix(lockPath, INSTALL_LOCK_FILE) || grewDuringRead) return;
            grewDuringRead = true;
            await writeFile(growingLeasePath, 'x'.repeat(4097));
          },
        },
        log: false,
      }),
      (error) => error.code === 'INSTALL_LOCK_UNSAFE' && /exceeds 4096 bytes/.test(error.message),
    );
    assert.equal(grewDuringRead, true);
    assert.equal((await stat(growingLeasePath)).size, 4097);
    assert.equal(await exists(path.join(growingLease, STATE_FILE)), false);

    const malformedLease = path.join(temporary, 'malformed-lease');
    await mkdir(malformedLease);
    await writeFile(path.join(malformedLease, INSTALL_LOCK_FILE), '{"unexpected":true}\n');
    const malformedBefore = await snapshot(malformedLease);
    await assert.rejects(
      installDistribution({ targetRoot: malformedLease, distributionRoot: v1, hosts: ['codex'], log: false }),
      (error) => error.code === 'INSTALL_LOCK_UNSAFE' && /supported closed owner schema/.test(error.message),
    );
    assert.deepEqual(await snapshot(malformedLease), malformedBefore);

    const linkedLease = path.join(temporary, 'hard-linked-lease');
    await mkdir(linkedLease);
    const linkedLeasePath = path.join(linkedLease, INSTALL_LOCK_FILE);
    await writeFile(linkedLeasePath, `${JSON.stringify(leaseOwner({ pid: 2147483647 }))}\n`);
    await link(linkedLeasePath, path.join(linkedLease, 'lease-alias'));
    const linkedBefore = await snapshot(linkedLease);
    await assert.rejects(
      installDistribution({ targetRoot: linkedLease, distributionRoot: v1, hosts: ['codex'], log: false }),
      (error) => error.code === 'INSTALL_LOCK_UNSAFE' && /link count 2/.test(error.message),
    );
    assert.deepEqual(await snapshot(linkedLease), linkedBefore, 'hard-linked leases are never recovered or removed');

    const symlinkLease = path.join(temporary, 'symlink-lease');
    const symlinkLeaseTarget = path.join(temporary, 'symlink-lease-target');
    await mkdir(symlinkLease);
    await mkdir(symlinkLeaseTarget);
    const leaseSentinel = path.join(symlinkLeaseTarget, 'sentinel.txt');
    await writeFile(leaseSentinel, 'preserve\n');
    try {
      await symlink(symlinkLeaseTarget, path.join(symlinkLease, INSTALL_LOCK_FILE), process.platform === 'win32' ? 'junction' : 'dir');
      await assert.rejects(
        installDistribution({ targetRoot: symlinkLease, distributionRoot: v1, hosts: ['codex'], log: false }),
        (error) => error.code === 'INSTALL_LOCK_UNSAFE' && /symbolic link/.test(error.message),
      );
      assert.equal(await text(leaseSentinel), 'preserve\n');
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    }

    const recentPartialLease = path.join(temporary, 'recent-partial-lease');
    await mkdir(recentPartialLease);
    await writeFile(path.join(recentPartialLease, INSTALL_LOCK_FILE), '{"schemaVersion":1,');
    const recentPartialBefore = await snapshot(recentPartialLease);
    await assert.rejects(
      installDistribution({ targetRoot: recentPartialLease, distributionRoot: v1, hosts: ['codex'], log: false }),
      (error) => error.code === 'INSTALL_LOCKED' && /recent partial initialization/.test(error.message),
    );
    assert.deepEqual(await snapshot(recentPartialLease), recentPartialBefore);

    for (const [name, content] of [['empty', ''], ['partial', '{"schemaVersion":1,"hostname":"']]) {
      const partialLease = path.join(temporary, `aged-${name}-lease`);
      await mkdir(partialLease);
      const partialLeasePath = path.join(partialLease, INSTALL_LOCK_FILE);
      await writeFile(partialLeasePath, content);
      const aged = new Date(Date.now() - INSTALL_LOCK_INITIALIZATION_STALE_MS - 5_000);
      await utimes(partialLeasePath, aged, aged);
      await installDistribution({ targetRoot: partialLease, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
      assert.equal(await exists(partialLeasePath), false, `aged ${name} partial lease must be recovered and released`);
      assert.equal(JSON.parse(await text(path.join(partialLease, STATE_FILE))).hosts.codex.profile, 'standard');
    }

    const abandonedRecovery = path.join(temporary, 'abandoned-recovery-guard');
    await mkdir(abandonedRecovery);
    await writeFile(
      path.join(abandonedRecovery, INSTALL_LOCK_RECOVERY_FILE),
      `${JSON.stringify(leaseOwner({ pid: 2147483647 }))}\n`,
    );
    const abandonedBefore = await snapshot(abandonedRecovery);
    for (const dryRun of [false, true]) {
      await assert.rejects(
        installDistribution({ targetRoot: abandonedRecovery, distributionRoot: v1, hosts: ['codex'], dryRun, log: false }),
        (error) => error.code === 'INSTALL_LOCKED' && /automatic recovery never removes this recovery guard/.test(error.message),
      );
      assert.deepEqual(await snapshot(abandonedRecovery), abandonedBefore);
    }

    const cleanupLease = path.join(temporary, 'cleanup-lease');
    await mkdir(cleanupLease);
    await assert.rejects(
      installDistribution({
        targetRoot: cleanupLease,
        distributionRoot: v1,
        hosts: ['codex'],
        mode: 'init',
        operations: { atomicWrite: async () => { throw new Error('injected failure while lease is held'); } },
        log: false,
      }),
      /injected failure while lease is held/,
    );
    assert.equal(await exists(path.join(cleanupLease, INSTALL_LOCK_FILE)), false, 'thrown mutations must still release the lease');

    const installerUrl = new URL('./install-distribution.mjs', import.meta.url).href;
    const publicationRace = path.join(temporary, 'lease-publication-race');
    const publicationControl = path.join(temporary, 'lease-publication-control');
    await mkdir(publicationRace);
    await mkdir(publicationControl);
    const publicationLock = path.join(publicationRace, INSTALL_LOCK_FILE);
    await writeFile(publicationLock, '{"schemaVersion":1,');
    const stalePublication = new Date(Date.now() - INSTALL_LOCK_INITIALIZATION_STALE_MS - 1_000);
    await utimes(publicationLock, stalePublication, stalePublication);
    const recovererScript = [
      "import { stat, writeFile } from 'node:fs/promises';",
      "import path from 'node:path';",
      `import { INSTALL_LOCK_FILE, installDistribution } from ${JSON.stringify(installerUrl)};`,
      'const [targetRoot, distributionRoot, controlRoot] = process.argv.slice(1);',
      "const exists = async (file) => { try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };",
      'const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));',
      'let paused = false;',
      'let result;',
      'try {',
      '  await installDistribution({',
      "    targetRoot, distributionRoot, hosts: ['codex'], mode: 'init', log: false,",
      '    operations: { afterLeaseRemovalInspection: async ({ leaseName }) => {',
      '      if (paused || leaseName !== INSTALL_LOCK_FILE) return;',
      '      paused = true;',
      "      await writeFile(path.join(controlRoot, 'recoverer-inspected'), 'inspected', { flag: 'wx' });",
      "      while (!await exists(path.join(controlRoot, 'release-recoverer'))) await delay(10);",
      '    } },',
      '  });',
      '  result = { ok: true };',
      '} catch (error) { result = { ok: false, code: error.code ?? null, message: error.message }; }',
      "await writeFile(path.join(controlRoot, 'recoverer-result.json'), JSON.stringify(result));",
    ].join('\n');
    const blockedPublisherScript = [
      "import { writeFile } from 'node:fs/promises';",
      "import path from 'node:path';",
      `import { installDistribution } from ${JSON.stringify(installerUrl)};`,
      'const [targetRoot, distributionRoot, controlRoot] = process.argv.slice(1);',
      'let result;',
      'try {',
      '  await installDistribution({',
      "    targetRoot, distributionRoot, hosts: ['codex'], mode: 'init', log: false,",
      "    operations: { beforeLeaseOwnerWrite: async () => { await writeFile(path.join(controlRoot, 'publisher-entered'), 'entered', { flag: 'wx' }); } },",
      '  });',
      '  result = { ok: true };',
      '} catch (error) { result = { ok: false, code: error.code ?? null, message: error.message }; }',
      "await writeFile(path.join(controlRoot, 'publisher-result.json'), JSON.stringify(result));",
    ].join('\n');
    const recovererRun = execFile(
      process.execPath,
      ['--input-type=module', '--eval', recovererScript, publicationRace, v1, publicationControl],
      { cwd: repo, windowsHide: true },
    );
    let blockedPublisherRun;
    try {
      await waitForFile(path.join(publicationControl, 'recoverer-inspected'));
      const partialBefore = await readFile(publicationLock);
      blockedPublisherRun = execFile(
        process.execPath,
        ['--input-type=module', '--eval', blockedPublisherScript, publicationRace, v1, publicationControl],
        { cwd: repo, windowsHide: true },
      );
      await waitForFile(path.join(publicationControl, 'publisher-result.json'));
      const publisherResult = JSON.parse(await text(path.join(publicationControl, 'publisher-result.json')));
      assert.equal(publisherResult.ok, false, 'a second process must not publish while stale recovery owns the guard');
      assert.equal(publisherResult.code, 'INSTALL_LOCKED');
      assert.equal(await exists(path.join(publicationControl, 'publisher-entered')), false);
      await assert.rejects(
        installDistribution({ targetRoot: publicationRace, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
        (error) => error.code === 'INSTALL_LOCKED',
      );
      assert.equal((await readFile(publicationLock)).equals(partialBefore), true, 'guarded final inspection preserves the classified partial');
      await writeFile(path.join(publicationControl, 'release-recoverer'), 'release\n');
      await recovererRun;
      await blockedPublisherRun;
      assert.equal(JSON.parse(await text(path.join(publicationControl, 'recoverer-result.json'))).ok, true);
      assert.equal(await exists(publicationLock), false);
      assert.equal(await exists(path.join(publicationRace, INSTALL_LOCK_RECOVERY_FILE)), false);
    } finally {
      await writeFile(path.join(publicationControl, 'release-recoverer'), 'release\n');
      await Promise.allSettled([recovererRun, blockedPublisherRun].filter(Boolean));
    }

    const successfulPublication = path.join(temporary, 'successful-lease-publication');
    const successfulControl = path.join(temporary, 'successful-publication-control');
    await mkdir(successfulPublication);
    await mkdir(successfulControl);
    const successfulPublisherScript = [
      "import { stat, writeFile } from 'node:fs/promises';",
      "import path from 'node:path';",
      `import { INSTALL_LOCK_FILE, installDistribution } from ${JSON.stringify(installerUrl)};`,
      'const [targetRoot, distributionRoot, controlRoot] = process.argv.slice(1);',
      "const exists = async (file) => { try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };",
      'const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));',
      'let result;',
      'try {',
      '  await installDistribution({',
      "    targetRoot, distributionRoot, hosts: ['codex'], mode: 'init', log: false,",
      '    operations: { beforeLeaseOwnerWrite: async ({ leaseName }) => {',
      '      if (leaseName !== INSTALL_LOCK_FILE) return;',
      "      await writeFile(path.join(controlRoot, 'publisher-writing'), 'writing', { flag: 'wx' });",
      "      while (!await exists(path.join(controlRoot, 'release-publisher'))) await delay(10);",
      '    } },',
      '  });',
      '  result = { ok: true };',
      '} catch (error) { result = { ok: false, code: error.code ?? null, message: error.message }; }',
      "await writeFile(path.join(controlRoot, 'publisher-result.json'), JSON.stringify(result));",
    ].join('\n');
    const successfulPublisherRun = execFile(
      process.execPath,
      ['--input-type=module', '--eval', successfulPublisherScript, successfulPublication, v1, successfulControl],
      { cwd: repo, windowsHide: true },
    );
    try {
      await waitForFile(path.join(successfulControl, 'publisher-writing'));
      const mainPublication = path.join(successfulPublication, INSTALL_LOCK_FILE);
      assert.equal((await stat(mainPublication)).size, 0, 'main lease pauses before publishing its owner record');
      assert.equal(await exists(path.join(successfulPublication, INSTALL_LOCK_RECOVERY_FILE)), true);
      const agedPublication = new Date(Date.now() - INSTALL_LOCK_INITIALIZATION_STALE_MS - 1_000);
      await utimes(mainPublication, agedPublication, agedPublication);
      for (const contender of ['second', 'third']) {
        let enteredRecovery = false;
        let enteredPublication = false;
        await assert.rejects(
          installDistribution({
            targetRoot: successfulPublication,
            distributionRoot: v1,
            hosts: ['codex'],
            mode: 'init',
            operations: {
              beforeLeaseRecovery: async () => { enteredRecovery = true; },
              beforeLeaseOwnerWrite: async () => { enteredPublication = true; },
            },
            log: false,
          }),
          (error) => error.code === 'INSTALL_LOCKED',
          `${contender} contender must serialize behind owner publication`,
        );
        assert.equal(enteredRecovery, false);
        assert.equal(enteredPublication, false);
      }
      await writeFile(path.join(successfulControl, 'release-publisher'), 'release\n');
      await successfulPublisherRun;
      assert.equal(JSON.parse(await text(path.join(successfulControl, 'publisher-result.json'))).ok, true);
      assert.equal(await exists(mainPublication), false);
      assert.equal(await exists(path.join(successfulPublication, INSTALL_LOCK_RECOVERY_FILE)), false);
    } finally {
      await writeFile(path.join(successfulControl, 'release-publisher'), 'release\n');
      await Promise.allSettled([successfulPublisherRun]);
    }

    const staleLease = path.join(temporary, 'stale-lease');
    await mkdir(staleLease);
    await writeFile(path.join(staleLease, INSTALL_LOCK_FILE), `${JSON.stringify(leaseOwner({ pid: 2147483647 }))}\n`);
    await installDistribution({ targetRoot: staleLease, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false });
    assert.equal(await exists(path.join(staleLease, INSTALL_LOCK_FILE)), false);

    const symlinkHost = path.join(temporary, 'symlink-host');
    const symlinkTarget = path.join(temporary, 'symlink-target');
    await mkdir(symlinkHost);
    await mkdir(symlinkTarget);
    try {
      await symlink(symlinkTarget, path.join(symlinkHost, '.agents'), process.platform === 'win32' ? 'junction' : 'dir');
      const symlinkBefore = await snapshot(symlinkTarget);
      await assert.rejects(
        installDistribution({ targetRoot: symlinkHost, distributionRoot: v1, hosts: ['codex'], mode: 'init', log: false }),
        (error) => error.code === 'SYMLINK',
      );
      assert.deepEqual(await snapshot(symlinkTarget), symlinkBefore);
    } catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
    }

    return true;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    await runInstallLifecycleTests();
    console.log('install lifecycle tests passed');
  } catch (error) {
    console.error(`FAIL: ${error.stack ?? error.message}`);
    process.exitCode = 1;
  }
}
