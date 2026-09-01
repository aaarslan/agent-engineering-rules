#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'tools', 'aer.mjs');
const ownershipEngine = path.join(repo, 'tools', 'install-distribution.mjs');

const exists = async (file) => {
  try { await stat(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
};

test('package metadata defines the public zero-dependency CLI release boundary', async () => {
  const manifest = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@aaarslan/aer');
  assert.equal(manifest.version, '3.1.0');
  assert.equal(Object.hasOwn(manifest, 'private'), false);
  assert.deepEqual(manifest.bin, { aer: 'tools/aer.mjs' });
  assert.deepEqual(manifest.engines, { node: '>=24' });
  assert.equal(manifest.license, 'MIT');
  assert.deepEqual(manifest.publishConfig, {
    access: 'public',
    registry: 'https://registry.npmjs.org/',
  });
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack', 'publish', 'postpublish']) {
    assert.equal(manifest.scripts[lifecycle], undefined, `unexpected ${lifecycle} lifecycle script`);
  }
  assert.equal(manifest.scripts.prepublishOnly, 'npm run release:check');
  assert.equal(
    manifest.scripts['release:check'],
    'npm test && npm run validate && npm run validate:research && npm run test:packed',
  );
  assert.doesNotMatch(manifest.scripts.prepublishOnly, /npm\s+(?:pack|publish)\b/);
  assert.deepEqual(manifest.files, [
    'LICENSE',
    'README.md',
    'INSTALL.md',
    'ADOPT.md',
    'dist/**',
    '!dist/**/agent-rules/metadata/**',
    'tools/aer.mjs',
    'tools/install-distribution.mjs',
    'tools/build-distributions.mjs',
    'tools/README.md',
  ]);
});

test('aer metadata flags and argument failures have deterministic output and exit codes', async () => {
  const caller = await mkdtemp(path.join(tmpdir(), 'aer-cli-metadata-'));
  try {
    const manifest = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'));
    await writeFile(path.join(caller, 'package.json'), '{"version":"999.0.0"}\n');

    const version = await execFile(process.execPath, [cli, '--version'], { cwd: caller, windowsHide: true });
    assert.equal(version.stdout, `${manifest.version}\n`);
    assert.equal(version.stderr, '');

    const help = await execFile(process.execPath, [cli, '--help'], { cwd: caller, windowsHide: true });
    assert.equal(help.stderr, '');
    assert.match(help.stdout, /aer --version/);
    assert.match(help.stdout, /aer init --host <claude\|codex\|both>/);

    const noArguments = await execFile(process.execPath, [cli], { cwd: caller, windowsHide: true });
    assert.equal(noArguments.stdout, help.stdout);
    assert.equal(noArguments.stderr, '');

    await assert.rejects(
      execFile(process.execPath, [cli, '--version', '--help'], { cwd: caller, windowsHide: true }),
      (error) => error.code === 2
        && error.stdout === ''
        && /AER FAILED: --version does not accept arguments/.test(error.stderr)
        && /Usage:/.test(error.stderr),
    );
    await assert.rejects(
      execFile(process.execPath, [cli, 'unknown-command'], { cwd: caller, windowsHide: true }),
      (error) => error.code === 2
        && error.stdout === ''
        && /AER FAILED: unknown command: unknown-command/.test(error.stderr)
        && /Usage:/.test(error.stderr),
    );
  } finally {
    await rm(caller, { recursive: true, force: true });
  }
});

test('aer CLI supports a project-local init/update/doctor/uninstall lifecycle', async () => {
  const target = await mkdtemp(path.join(tmpdir(), 'aer-cli-'));
  try {
    const hostText = '# Project instructions\n\nKeep this text.\n';
    await writeFile(path.join(target, 'AGENTS.md'), hostText);

    const dryRun = await execFile(process.execPath, [cli, 'init', '--host', 'codex', '--dry-run'], { cwd: target, windowsHide: true });
    assert.match(dryRun.stdout, /WOULD INSTALL codex/);
    assert.equal(await exists(path.join(target, '.agent-engineering-rules-state.json')), false);

    await execFile(process.execPath, [cli, 'init', '--host', 'codex'], { cwd: target, windowsHide: true });
    const state = JSON.parse(await readFile(path.join(target, '.agent-engineering-rules-state.json'), 'utf8'));
    assert.equal(state.schemaVersion, 3);
    assert.equal(state.hosts.codex.profile, 'standard');
    assert.deepEqual(state.hosts.codex.contexts, []);
    assert.match(state.hosts.codex.root.sha256, /^[a-f0-9]{64}$/);

    const doctor = await execFile(process.execPath, [cli, 'doctor', '--json'], { cwd: target, windowsHide: true });
    const health = JSON.parse(doctor.stdout);
    assert.equal(health.status, 'current');
    assert.deepEqual(health.hosts, ['codex']);

    await assert.rejects(
      execFile(process.execPath, [cli, 'init', '--host', 'codex'], { cwd: target, windowsHide: true }),
      (error) => error.code === 1 && /configures codex; use update/.test(error.stderr),
    );
    await execFile(process.execPath, [cli, 'update', '--dry-run'], { cwd: target, windowsHide: true });
    await execFile(process.execPath, [cli, 'uninstall', '--dry-run'], { cwd: target, windowsHide: true });
    assert.equal(await exists(path.join(target, '.agent-engineering-rules-state.json')), true);

    await execFile(process.execPath, [cli, 'uninstall'], { cwd: target, windowsHide: true });
    assert.equal(await exists(path.join(target, '.agent-engineering-rules-state.json')), false);
    assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), hostText);

    await assert.rejects(
      execFile(process.execPath, [cli, 'doctor', '--json'], { cwd: target, windowsHide: true }),
      (error) => error.code === 2 && JSON.parse(error.stdout).status === 'invalid',
    );
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('the ownership engine is not a second user-facing CLI', async () => {
  await assert.rejects(
    execFile(process.execPath, [ownershipEngine, '--help'], { cwd: repo, windowsHide: true }),
    (error) => error.code === 2 && /Use the project CLI/.test(error.stderr),
  );
});

test('development package exposes only the project-local CLI and excludes eval payloads', async () => {
  const npmCache = await mkdtemp(path.join(tmpdir(), 'aer-npm-cache-'));
  const command = process.platform === 'win32' ? process.env.ComSpec : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm', 'pack', '--dry-run', '--json', '--ignore-scripts']
    : ['pack', '--dry-run', '--json', '--ignore-scripts'];
  try {
    const { stdout } = await execFile(command, args, {
      cwd: repo,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: npmCache },
    });
    const report = JSON.parse(stdout);
    const files = report[0].files.map((entry) => entry.path.replaceAll('\\', '/'));
    assert.ok(files.includes('tools/aer.mjs'));
    assert.ok(files.includes('tools/install-distribution.mjs'));
    assert.ok(files.some((file) => file === 'dist/codex/AGENTS.md'));
    assert.ok(files.some((file) => file === 'dist/claude/.claude/rules/core-contract.md'));
    assert.equal(files.some((file) => file.startsWith('source/')), false);
    assert.equal(files.some((file) => file.includes('/metadata/')), false);
    assert.equal(files.some((file) => file.startsWith('docs/')), false);
    assert.equal(files.some((file) => file === 'tools/live-ab-eval.mjs'), false);
    assert.equal(files.some((file) => file.endsWith('.test.mjs')), false);
    const unexpected = files.filter((file) => ![
      'ADOPT.md', 'INSTALL.md', 'LICENSE', 'README.md', 'package.json',
      'tools/README.md', 'tools/aer.mjs', 'tools/build-distributions.mjs', 'tools/install-distribution.mjs',
    ].includes(file) && !file.startsWith('dist/'));
    assert.deepEqual(unexpected, []);

    const execArgs = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm', 'exec', '--offline', '--package=.', '--', 'aer', '--help']
      : ['exec', '--offline', '--package=.', '--', 'aer', '--help'];
    const executed = await execFile(command, execArgs, {
      cwd: repo,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, npm_config_cache: npmCache },
    });
    assert.match(executed.stdout, /aer init --host <claude\|codex\|both>/);
  } finally {
    await rm(npmCache, { recursive: true, force: true });
  }
});
