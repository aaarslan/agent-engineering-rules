import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MANIFEST,
  assertBuildDestinations,
  assertBuildSourcePaths,
  assertContextManifest,
  assertNoBuildDestinationCollisions,
  build,
  buildDestinationCollisions,
  buildDestinationPathErrors,
  contextManifestErrors,
  contextRuleSourceErrors,
  frontmatterFields,
  rewriteToolPaths,
  stripFrontmatter,
  thinContextRouteErrors,
} from './build-distributions.mjs';

test('context manifest is one closed safe authority for build and install routing', async () => {
  assert.deepEqual(contextManifestErrors(MANIFEST), []);
  assert.deepEqual(await contextRuleSourceErrors(MANIFEST), []);
  await assert.doesNotReject(() => assertContextManifest(MANIFEST));

  const mutations = [
    ['duplicate names', (manifest) => { manifest.contexts[1].name = manifest.contexts[0].name; }, /context names must be unique/],
    ['noncanonical default', (manifest) => { manifest.defaultProfile = 'prototype'; }, /defaultProfile must be the canonical standard profile/],
    ['unshipped source', (manifest) => { manifest.contexts[0].source = 'contexts/not-shipped.md'; }, /not shipped in MANIFEST\.reference/],
    ['unsafe rule', (manifest) => { manifest.contexts[0].rule = '../escape.md'; }, /rule is unsafe/],
    ['unsafe path controls', (manifest) => { manifest.contexts[0].paths = [String.raw`api\**`]; }, /paths must be non-empty portable/],
    ['self dependency', (manifest) => { manifest.contexts[0].requires = [manifest.contexts[0].name]; }, /must not require itself/],
    ['unknown dependency', (manifest) => { manifest.contexts[0].requires = ['unknown']; }, /requires unknown context/],
    ['duplicate dependencies', (manifest) => { manifest.contexts[0].requires = ['typescript-react', 'typescript-react']; }, /requires must be an array of unique/],
    ['missing required full reference', (manifest) => { manifest.contexts[0].references = ['contexts/web-ui.md']; }, /references must include required context source/],
    ['duplicate rule sources', (manifest) => { manifest.contexts[1].ruleSource = manifest.contexts[0].ruleSource; }, /ruleSource paths must be unique/],
  ];
  for (const [label, mutate, expected] of mutations) {
    const manifest = structuredClone(MANIFEST);
    mutate(manifest);
    assert.match(contextManifestErrors(manifest).join('\n'), expected, label);
  }
});

test('context adapters stay thin and cannot become a second rule authority', () => {
  assert.deepEqual(thinContextRouteErrors('---\nscope: [context]\n---\n\n# Route\n\nRead `agent-rules/reference/example.md`.\n'), []);
  assert.match(thinContextRouteErrors('# Route\n\nRead the reference.\n\n- AE-01: duplicate policy\n').join('\n'), /one routing paragraph|duplicate rule authorities/);
  assert.match(thinContextRouteErrors(`# Route\n\n${'Read the full reference. '.repeat(60)}\n`).join('\n'), /maximum is 1024/);
});

test('repository-only research inputs are validated but never emitted', async (context) => {
  const output = await mkdtemp(path.join(tmpdir(), 'aer-research-boundary-'));
  context.after(() => rm(output, { recursive: true, force: true }));
  assert.ok(MANIFEST.research.includes('evals/run.schema.json'));
  assert.ok(MANIFEST.research.includes('evals/components.v2.json'));
  assert.ok(MANIFEST.research.includes('evals/components/v2/kernel/contract.txt'));
  await build(output);
  for (const host of ['claude', 'codex']) {
    await assert.rejects(
      () => lstat(path.join(output, host, 'agent-rules', 'metadata')),
      (error) => error.code === 'ENOENT',
    );
    await assert.rejects(
      () => lstat(path.join(output, host, 'evals')),
      (error) => error.code === 'ENOENT',
    );
  }
});

test('ruleSource validation distinguishes unsafe, missing, and symlink traversal', async (context) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aer-context-source-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(path.join(fixture, 'source'));
  const unsafe = structuredClone(MANIFEST);
  unsafe.contexts[0].ruleSource = '../outside.md';
  assert.match((await contextRuleSourceErrors(unsafe, path.join(fixture, 'source'))).join('\n'), /is unsafe/);
  const missing = structuredClone(MANIFEST);
  missing.contexts[0].ruleSource = 'contexts/missing.md';
  assert.match((await contextRuleSourceErrors(missing, path.join(fixture, 'source'))).join('\n'), /is missing/);

  const outside = path.join(fixture, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'route.md'), '# escaped\n');
  try {
    await symlink(outside, path.join(fixture, 'source', 'contexts'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { context.skip('symlink creation is unavailable'); return; }
    throw error;
  }
  const escaped = structuredClone(MANIFEST);
  escaped.contexts = [{ ...escaped.contexts[0], ruleSource: 'contexts/route.md' }];
  assert.match((await contextRuleSourceErrors(escaped, path.join(fixture, 'source'))).join('\n'), /is unsafe/);
});

test('build rejects a missing ruleSource before clearing existing output', async (context) => {
  const output = await mkdtemp(path.join(tmpdir(), 'aer-context-build-'));
  context.after(() => rm(output, { recursive: true, force: true }));
  const sentinel = path.join(output, 'claude', 'sentinel.txt');
  await mkdir(path.dirname(sentinel), { recursive: true });
  await writeFile(sentinel, 'preserve\n');
  const original = MANIFEST.contexts[0].ruleSource;
  try {
    delete MANIFEST.contexts[0].ruleSource;
    await assert.rejects(() => build(output), /ruleSource is missing/);
    assert.equal(await readFile(sentinel, 'utf8'), 'preserve\n');
  } finally {
    MANIFEST.contexts[0].ruleSource = original;
  }
});

test('build frontmatter helpers accept CRLF and normalize the emitted body', () => {
  const source = '---\r\nname: example\r\ndescription: CRLF fixture\r\n---\r\n\r\n# Body\r\n';
  assert.deepEqual(frontmatterFields(source), { name: 'example', description: 'CRLF fixture' });
  assert.equal(stripFrontmatter(source), '# Body\n');
});

test('tool-path rewrites are token-boundary-aware and idempotent', () => {
  const source = [
    'tools/contrast-check.mjs',
    './tools/slop-scan.mjs',
    '`tools/file-size-guard.mjs`',
    'agent-rules/tools/contrast-check.mjs',
    'mytools/slop-scan.mjs',
    'tools/file-size-guard.mjs.backup',
    '/tools/contrast-check.mjs',
  ].join('\n');
  const rewritten = rewriteToolPaths(source);
  assert.equal(rewritten.split('\n')[0], 'agent-rules/tools/contrast-check.mjs');
  assert.equal(rewritten.split('\n')[1], './agent-rules/tools/slop-scan.mjs');
  assert.equal(rewritten.split('\n')[2], '`agent-rules/tools/file-size-guard.mjs`');
  assert.match(rewritten, /^agent-rules\/tools\/contrast-check\.mjs$/m);
  assert.match(rewritten, /^mytools\/slop-scan\.mjs$/m);
  assert.match(rewritten, /^tools\/file-size-guard\.mjs\.backup$/m);
  assert.match(rewritten, /^\/tools\/contrast-check\.mjs$/m);
  assert.equal(rewriteToolPaths(rewritten), rewritten);
});

test('the current manifest has one producer per case-insensitive output destination', () => {
  assert.deepEqual(buildDestinationPathErrors(MANIFEST), []);
  assert.doesNotThrow(() => assertBuildDestinations(MANIFEST));
  assert.deepEqual(buildDestinationCollisions(MANIFEST), []);
  assert.doesNotThrow(() => assertNoBuildDestinationCollisions(MANIFEST));
});

test('destination preflight rejects portable path escapes and Windows aliases', () => {
  const unsafeAgentNames = [
    '../escape',
    String.raw`..\escape`,
    '/absolute',
    'C:/absolute',
    'C:drive-relative',
    '//server/share',
    String.raw`\\server\share`,
    'nested/./agent',
    'trailing./agent',
    'trailing /agent',
    'NUL',
  ];
  for (const name of unsafeAgentNames) {
    const manifest = structuredClone(MANIFEST);
    manifest.agents[0].name = name;
    assert.ok(buildDestinationPathErrors(manifest).length, `${name} must be rejected on every build platform`);
    assert.throws(() => assertBuildDestinations(manifest), /unsafe build output destinations/);
  }
});

test('destination diagnostics are total for malformed manifest fields', () => {
  const manifest = structuredClone(MANIFEST);
  manifest.reference[0] = null;
  delete manifest.skills[0].name;
  delete manifest.agents[0].name;
  let errors;
  assert.doesNotThrow(() => { errors = buildDestinationPathErrors(manifest); });
  assert.match(errors.join('\n'), /reference\[0\].*non-empty string/);
  assert.match(errors.join('\n'), /skills\[0\]\.name.*flat lowercase/);
  assert.match(errors.join('\n'), /agents\[0\]\.name.*flat lowercase/);
  assert.throws(() => assertBuildDestinations(manifest), /unsafe build output destinations/);
});

test('unsafe agent destinations cannot escape or clear either existing host output', async (context) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aer-output-containment-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const output = path.join(fixture, 'out');
  const sentinels = [path.join(output, 'claude', 'sentinel.txt'), path.join(output, 'codex', 'sentinel.txt')];
  for (const sentinel of sentinels) {
    await mkdir(path.dirname(sentinel), { recursive: true });
    await writeFile(sentinel, 'preserve\n');
  }
  const escaped = path.join(fixture, 'escaped.md');
  const original = MANIFEST.agents[0].name;
  try {
    MANIFEST.agents[0].name = '../../../../escaped';
    await assert.rejects(() => build(output), /unsafe build output destinations/);
    for (const sentinel of sentinels) assert.equal(await readFile(sentinel, 'utf8'), 'preserve\n');
    await assert.rejects(() => readFile(escaped), (error) => error.code === 'ENOENT');
  } finally {
    MANIFEST.agents[0].name = original;
  }
});

test('outside and missing source paths fail before either host output is cleared', async (context) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aer-source-preflight-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const output = path.join(fixture, 'out');
  const sentinels = [path.join(output, 'claude', 'sentinel.txt'), path.join(output, 'codex', 'sentinel.txt')];
  for (const sentinel of sentinels) {
    await mkdir(path.dirname(sentinel), { recursive: true });
    await writeFile(sentinel, 'preserve\n');
  }
  const original = MANIFEST.reference[0];
  try {
    MANIFEST.reference[0] = '../README.md';
    await assert.rejects(() => build(output), /unsafe build output destinations/);
    MANIFEST.reference[0] = 'design/does-not-exist.md';
    await assert.rejects(() => build(output), /invalid build source paths/);
    for (const sentinel of sentinels) assert.equal(await readFile(sentinel, 'utf8'), 'preserve\n');
  } finally {
    MANIFEST.reference[0] = original;
  }
});

test('source preflight rejects symbolic-link traversal', async (context) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aer-source-link-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const sourceDirectory = path.join(fixture, 'source');
  const repositoryDirectory = path.join(fixture, 'repo');
  const outside = path.join(fixture, 'outside');
  await mkdir(path.join(sourceDirectory, 'profiles'), { recursive: true });
  await mkdir(path.join(sourceDirectory, 'templates'), { recursive: true });
  await mkdir(repositoryDirectory, { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(sourceDirectory, 'profiles', 'standard.md'), '# Standard\n');
  await writeFile(path.join(sourceDirectory, 'templates', 'claude-root.md'), '# Claude\n');
  await writeFile(path.join(sourceDirectory, 'templates', 'codex-root.md'), '# Codex\n');
  await writeFile(path.join(outside, 'route.md'), '# Escaped\n');
  try {
    await symlink(outside, path.join(sourceDirectory, 'contexts'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) { context.skip('symlink creation is unavailable'); return; }
    throw error;
  }
  const manifest = { defaultProfile: 'standard', core: [], skills: [], contexts: [], reference: ['contexts/route.md'], profiles: [], research: [], tools: [], agents: [] };
  await assert.rejects(
    () => assertBuildSourcePaths(manifest, { sourceDirectory, repositoryDirectory }),
    /source traverses a symbolic link/,
  );
});

test('build refuses symlinked output and host roots before recursive removal', async (context) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aer-output-link-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  const outside = path.join(fixture, 'outside');
  const output = path.join(fixture, 'linked-output');
  const outsideSentinel = path.join(outside, 'claude', 'sentinel.txt');
  await mkdir(path.dirname(outsideSentinel), { recursive: true });
  await writeFile(outsideSentinel, 'preserve\n');
  try {
    await symlink(outside, output, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    const fallback = path.join(fixture, 'fallback');
    await mkdir(fallback);
    await writeFile(path.join(fallback, 'claude'), 'preserve\n');
    await assert.rejects(() => build(fallback), /claude output root is not a directory/);
    assert.equal(await readFile(path.join(fallback, 'claude'), 'utf8'), 'preserve\n');
    return;
  }
  await assert.rejects(() => build(output), /output root is a symbolic link/);
  assert.equal(await readFile(outsideSentinel, 'utf8'), 'preserve\n');

  const hostOutput = path.join(fixture, 'host-output');
  const hostTarget = path.join(fixture, 'host-target');
  const hostSentinel = path.join(hostTarget, 'sentinel.txt');
  await mkdir(hostOutput);
  await mkdir(hostTarget);
  await writeFile(hostSentinel, 'preserve\n');
  await symlink(hostTarget, path.join(hostOutput, 'claude'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(() => build(hostOutput), /claude output root is a symbolic link/);
  assert.equal(await readFile(hostSentinel, 'utf8'), 'preserve\n');

  const ancestorTarget = path.join(fixture, 'ancestor-target');
  const ancestorAlias = path.join(fixture, 'ancestor-alias');
  await mkdir(path.join(ancestorTarget, 'out'), { recursive: true });
  await symlink(ancestorTarget, ancestorAlias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.doesNotReject(() => build(path.join(ancestorAlias, 'out')));
  assert.match(await readFile(path.join(ancestorTarget, 'out', 'claude', 'CLAUDE.md'), 'utf8'), /^# Engineering rules/m);
});

test('duplicate manifest destinations fail deterministically across every flattened output category', () => {
  const cases = [
    ['skill', (manifest) => manifest.skills.push(structuredClone(manifest.skills[0])), '.claude/skills/feature/SKILL.md'],
    ['agent', (manifest) => manifest.agents.push(structuredClone(manifest.agents[0])), '.claude/agents/code-reviewer.md'],
    ['context rule', (manifest) => manifest.contexts.push({ ...structuredClone(manifest.contexts[0]), source: 'contexts/duplicate.md' }), '.claude/rules/context-web-ui.md'],
    ['reference basename', (manifest) => manifest.reference.push('duplicate/principles.md'), 'agent-rules/reference/principles.md'],
    ['profile basename', (manifest) => manifest.profiles.push('duplicate/prototype.md'), 'agent-rules/profiles/prototype.md'],
    ['tool basename', (manifest) => manifest.tools.push('duplicate/contrast-check.mjs'), 'agent-rules/tools/contrast-check.mjs'],
    ['case-insensitive agent alias', (manifest) => manifest.agents.push({ ...structuredClone(manifest.agents[0]), name: manifest.agents[0].name.toUpperCase() }), '.claude/agents/CODE-REVIEWER.md'],
  ];

  for (const [label, mutate, expectedDestination] of cases) {
    const manifest = structuredClone(MANIFEST);
    mutate(manifest);
    const first = buildDestinationCollisions(manifest);
    const second = buildDestinationCollisions(manifest);
    assert.deepEqual(first, second, `${label} collision order must be deterministic`);
    assert.ok(first.some(({ destination }) => destination.endsWith(expectedDestination)), `${label} collision must name ${expectedDestination}`);
    assert.throws(
      () => assertNoBuildDestinationCollisions(manifest),
      (error) => /build output destination collisions/.test(error.message) && error.message.includes(expectedDestination),
    );
  }
});
