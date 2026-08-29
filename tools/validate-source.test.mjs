import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MANIFEST } from './build-distributions.mjs';
import {
  contextRouteReferenceErrors,
  generatedReferencePathErrors,
  normalizeRepoRelativePath,
  orphanedSourceFiles,
  parseSourceFrontmatter,
  protectedClaudeSkillCollisions,
  walkSourceFiles,
} from './validate-source.mjs';

test('manifest exposes only the greenfield canonical skills and profiles', () => {
  assert.deepEqual(MANIFEST.skills.map((skill) => skill.name), [
    'feature', 'bug-fix', 'refactor', 'pr-review', 'data-change',
    'aer-security-review', 'aer-verify', 'autonomous-mission', 'doc-update', 'ui-styling',
  ]);
  assert.equal(MANIFEST.skills.some((skill) => Object.hasOwn(skill, 'aliasFor')), false);
  assert.deepEqual(MANIFEST.profiles.map((source) => path.posix.basename(source, '.md')), [
    'prototype', 'standard', 'high-assurance',
  ]);
  assert.equal(Object.hasOwn(MANIFEST, 'profileAliases'), false);
});

test('source frontmatter parsing accepts CRLF without retaining carriage returns', () => {
  const parsed = parseSourceFrontmatter('---\r\nscope: always\r\nrelated: [testing.md]\r\n---\r\n# Body\r\n');
  assert.equal(parsed.closed, true);
  assert.deepEqual(parsed.invalidRows, []);
  assert.equal(parsed.fields.get('scope'), 'always');
  assert.equal(parsed.fields.get('related'), '[testing.md]');
});

test('normalizes backslash-form repository paths before matching', () => {
  const manifestPaths = new Set(['skills/bug-fix.md', 'templates/codex-root.md']);
  const skill = normalizeRepoRelativePath(String.raw`skills\bug-fix.md`);
  const template = normalizeRepoRelativePath(String.raw`templates\codex-root.md`);

  assert.equal(skill, 'skills/bug-fix.md');
  assert.equal(template, 'templates/codex-root.md');
  assert.equal(skill.startsWith('skills/'), true);
  assert.equal(template.startsWith('templates/'), true);
  assert.equal(manifestPaths.has(skill), true);
  assert.equal(manifestPaths.has(template), true);
});

test('preserves canonical and mixed-separator repository paths', () => {
  assert.equal(normalizeRepoRelativePath('core/priorities.md'), 'core/priorities.md');
  assert.equal(normalizeRepoRelativePath(String.raw`contexts\nested/web-ui.md`), 'contexts/nested/web-ui.md');
});

test('source walking exposes non-Markdown regular files to closure validation', async (context) => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'aer-source-walk-'));
  context.after(() => rm(fixture, { recursive: true, force: true }));
  await mkdir(path.join(fixture, 'nested'));
  await writeFile(path.join(fixture, 'root.md'), '# Root\n');
  await writeFile(path.join(fixture, 'nested', 'unexpected.txt'), 'not part of the source schema\n');

  const names = (await walkSourceFiles(fixture))
    .map((file) => normalizeRepoRelativePath(path.relative(fixture, file)))
    .sort();
  assert.deepEqual(names, ['nested/unexpected.txt', 'root.md']);
  assert.deepEqual(orphanedSourceFiles(names, ['root.md'], new Map(), new Set()), ['nested/unexpected.txt']);
});

test('include reachability starts at manifest roots, not orphan cycles or allowlisted templates', () => {
  const files = ['root.md', 'cycle-a.md', 'cycle-b.md', 'contexts/_template.md', 'template-only.md', 'reachable.md'];
  const graph = new Map([
    ['root.md', ['reachable.md']],
    ['cycle-a.md', ['cycle-b.md']],
    ['cycle-b.md', ['cycle-a.md']],
    ['contexts/_template.md', ['template-only.md']],
  ]);
  assert.deepEqual(
    orphanedSourceFiles(files, ['root.md'], graph, new Set(['contexts/_template.md'])),
    ['cycle-a.md', 'cycle-b.md', 'template-only.md'],
  );
});

test('generated reference paths must match the exact flat build destination', () => {
  const references = new Set(['testing.md', 'security.md']);
  assert.deepEqual(generatedReferencePathErrors('Read `agent-rules/reference/testing.md`.', references), []);
  assert.match(
    generatedReferencePathErrors('Read `agent-rules/reference/nonexistent/testing.md`.', references).join('\n'),
    /generated reference path does not exist/,
  );
  assert.match(
    generatedReferencePathErrors(`Read \`${String.raw`agent-rules\reference\testing.md`}\`.`, references).join('\n'),
    /generated reference path does not exist/,
  );
  assert.match(
    generatedReferencePathErrors('Read `testing.md`.', references).join('\n'),
    /must be exactly/,
  );
  assert.match(
    generatedReferencePathErrors('Read `./agent-rules/reference/testing.md`.', references).join('\n'),
    /must be exactly/,
  );
  assert.match(
    generatedReferencePathErrors('Read `foo/agent-rules/reference/testing.md`.', references).join('\n'),
    /must be exactly/,
  );
});

test('Claude routes name exactly their declared installed references and read the primary', () => {
  const context = {
    source: 'contexts/web-ui.md',
    references: ['contexts/web-ui.md', 'contexts/typescript-react.md'],
    requires: ['typescript-react'],
  };
  const sources = new Set(['contexts/web-ui.md', 'contexts/typescript-react.md']);
  const valid = 'Read `agent-rules/reference/web-ui.md` and then `agent-rules/reference/typescript-react.md`.';
  assert.deepEqual(contextRouteReferenceErrors(valid, context, sources), []);
  assert.match(
    contextRouteReferenceErrors('Read `agent-rules/reference/web-ui.md`.', context, sources).join('\n'),
    /omits declared installed full reference.*typescript-react\.md/,
  );
  assert.match(
    contextRouteReferenceErrors(`${valid} Also inspect \`agent-rules/reference/security.md\`.`, context, new Set([...sources, 'quality/security.md'])).join('\n'),
    /names undeclared installed reference.*security\.md/,
  );
  assert.match(
    contextRouteReferenceErrors('Use `agent-rules/reference/web-ui.md` and `agent-rules/reference/typescript-react.md`.', context, sources).join('\n'),
    /explicitly direct the agent to read/,
  );
});

test('rejects project skills that replace protected Claude native entrypoints', () => {
  const protectedEntryPoints = ['security-review', 'verify'];
  assert.deepEqual(protectedClaudeSkillCollisions(['feature', 'aer-security-review', 'aer-verify'], protectedEntryPoints), []);
  assert.deepEqual(protectedClaudeSkillCollisions(['verify', 'feature', 'security-review'], protectedEntryPoints), ['security-review', 'verify']);
});
