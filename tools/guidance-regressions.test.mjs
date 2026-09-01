import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MANIFEST, build } from './build-distributions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(repo, 'source');
const source = (relative) => readFile(path.join(sourceRoot, relative), 'utf8');

const directives = [
  { id: 'observed-evidence', owner: 'kernel/contract.md', marker: 'Exit code zero is insufficient unless expected evidence was observed' },
  { id: 'not-applicable-is-not-pass', owner: 'kernel/contract.md', marker: 'a reasoned not-applicable result is a disposition, not a pass' },
  { id: 'generated-and-untracked-diff', owner: 'skills/feature.md', marker: '`git diff` and `git diff --check` cover tracked content only' },
  { id: 'framework-benefit', owner: 'skills/feature.md', marker: 'In an empty single-screen prototype, prefer platform-native HTML/CSS/JS' },
  { id: 'three-ui-dimensions', owner: 'skills/ui-styling.md', marker: 'Evaluate and report three independent dimensions' },
  { id: 'real-ui-transition', owner: 'contexts/web-ui.md', marker: 'Exercise the promised state transition, not an acknowledgement' },
  { id: 'mobile-overflow', owner: 'contexts/web-ui.md', marker: '`document.documentElement.scrollWidth` with `document.documentElement.clientWidth`' },
  { id: 'honest-controls', owner: 'contexts/web-ui.md', marker: 'Do not add an inert hamburger, export, navigation, or action control merely for polish' },
  { id: 'scoped-contrast', owner: 'contexts/web-ui.md', marker: 'selected named opaque foreground/background pairs' },
  { id: 'scoped-slop-scan', owner: 'contexts/web-ui.md', marker: 'only when supported web files and relevant risks such as unsafe sinks' },
  { id: 'local-prototype-resources', owner: 'contexts/web-ui.md', marker: 'For a self-contained prototype, prefer system fonts and local assets' },
  { id: 'disposable-test-files', owner: 'quality/testing.md', marker: 'a disposable mockup need not add durable test files' },
  { id: 'classified-cli-outcome', owner: 'workflow/verification.md', marker: 'Before first use of a shipped CLI, inspect its `--help`' },
  { id: 'prototype-routing', owner: 'profiles/prototype.md', marker: 'avoid maintained-software ceremony that does not protect this slice' },
  { id: 'standard-routing', owner: 'profiles/standard.md', marker: 'stored state is expected to be maintained or extended' },
];

const bundles = {
  'codex-static-ui': [
    'templates/codex-root.md', 'kernel/contract.md', 'profiles/standard.md',
    'skills/feature.md', 'skills/ui-styling.md', 'contexts/web-ui.md',
    'contexts/ui-styling.md', 'quality/testing.md', 'quality/security.md',
    'workflow/verification.md',
  ],
  'claude-static-ui': [
    'templates/claude-root.md', 'kernel/contract.md', 'profiles/standard.md',
    'skills/feature.md', 'skills/ui-styling.md', 'contexts/claude-web-ui.md',
    'contexts/web-ui.md', 'contexts/ui-styling.md', 'quality/testing.md',
    'quality/security.md', 'workflow/verification.md',
  ],
  'codex-react-ui': [
    'templates/codex-root.md', 'kernel/contract.md', 'profiles/standard.md',
    'skills/feature.md', 'skills/ui-styling.md', 'contexts/web-ui.md',
    'contexts/ui-styling.md', 'contexts/typescript-react.md', 'quality/testing.md',
    'quality/security.md', 'workflow/verification.md',
  ],
  'codex-prototype-ui': [
    'templates/codex-root.md', 'kernel/contract.md', 'profiles/prototype.md',
    'skills/feature.md', 'skills/ui-styling.md', 'contexts/web-ui.md',
    'contexts/ui-styling.md', 'quality/testing.md', 'quality/security.md',
    'workflow/verification.md',
  ],
  'claude-prototype-ui': [
    'templates/claude-root.md', 'kernel/contract.md', 'profiles/prototype.md',
    'skills/feature.md', 'skills/ui-styling.md', 'contexts/claude-web-ui.md',
    'contexts/web-ui.md', 'contexts/ui-styling.md', 'quality/testing.md',
    'quality/security.md', 'workflow/verification.md',
  ],
  'codex-verify': [
    'templates/codex-root.md', 'kernel/contract.md', 'profiles/standard.md',
    'skills/aer-verify.md', 'quality/testing.md', 'quality/security.md',
    'workflow/verification.md',
  ],
  'claude-verify': [
    'templates/claude-root.md', 'kernel/contract.md', 'profiles/standard.md',
    'skills/aer-verify.md', 'quality/testing.md', 'quality/security.md',
    'workflow/verification.md',
  ],
};

const semanticOwners = [
  {
    id: 'deterministic-enforcement',
    expression: /(?:\*\*AE-23 — Deterministic enforcement\.\*\*|Put hard requirements in permissions)/g,
    owners: Object.fromEntries(Object.keys(bundles).map((bundle) => [bundle, 'kernel/contract.md'])),
  },
  {
    id: 'verification-contract-routing',
    expression: /matching verification contract/g,
    owners: { 'codex-verify': 'skills/aer-verify.md', 'claude-verify': 'skills/aer-verify.md' },
  },
  {
    id: 'selected-stack-routing',
    expression: /stack is selected or already present/g,
    owners: Object.fromEntries(Object.keys(bundles).map((bundle) => [bundle, bundle.startsWith('codex-') ? 'templates/codex-root.md' : 'templates/claude-root.md'])),
  },
  {
    id: 'testing-reference-routing',
    expression: /durable behavior or meaningful regression exposure/gi,
    owners: Object.fromEntries(Object.keys(bundles).map((bundle) => [bundle, bundle.startsWith('codex-') ? 'templates/codex-root.md' : 'templates/claude-root.md'])),
  },
  {
    id: 'responsive-viewport-evidence',
    expression: /representative desktop and narrow-mobile/g,
    owners: Object.fromEntries(Object.keys(bundles).filter((bundle) => bundle.endsWith('-ui')).map((bundle) => [bundle, 'contexts/web-ui.md'])),
  },
  {
    id: 'prompt-critical-over-structural',
    expression: /prompt-critical assertions/g,
    owners: Object.fromEntries(Object.keys(bundles).map((bundle) => [bundle, 'kernel/contract.md'])),
  },
  {
    id: 'unsolicited-desktop-shell',
    expression: /unsolicited desktop shell/g,
    owners: Object.fromEntries(Object.keys(bundles).filter((bundle) => bundle.endsWith('-ui')).map((bundle) => [bundle, 'contexts/ui-styling.md'])),
  },
  {
    id: 'prototype-resource-routing',
    expression: /self-contained prototype, prefer system fonts and local assets/g,
    owners: Object.fromEntries(Object.keys(bundles).filter((bundle) => bundle.endsWith('-ui')).map((bundle) => [bundle, 'contexts/web-ui.md'])),
  },
];

const generatedOwners = {
  'kernel/contract.md': ['claude/.claude/rules/core-contract.md', 'codex/AGENTS.md'],
  'skills/feature.md': ['claude/.claude/skills/feature/SKILL.md', 'codex/.agents/skills/feature/SKILL.md'],
  'skills/ui-styling.md': ['claude/.claude/skills/ui-styling/SKILL.md', 'codex/.agents/skills/ui-styling/SKILL.md'],
  'contexts/web-ui.md': ['claude/agent-rules/reference/web-ui.md', 'codex/agent-rules/reference/web-ui.md'],
  'contexts/ui-styling.md': ['claude/agent-rules/reference/ui-styling.md', 'codex/agent-rules/reference/ui-styling.md'],
  'contexts/typescript-react.md': ['claude/agent-rules/reference/typescript-react.md', 'codex/agent-rules/reference/typescript-react.md'],
  'quality/testing.md': ['claude/agent-rules/reference/testing.md', 'codex/agent-rules/reference/testing.md'],
  'workflow/verification.md': ['claude/agent-rules/reference/verification.md', 'codex/agent-rules/reference/verification.md'],
  'profiles/prototype.md': ['claude/agent-rules/profiles/prototype.md', 'codex/agent-rules/profiles/prototype.md'],
  'profiles/standard.md': ['claude/agent-rules/profiles/standard.md', 'codex/agent-rules/profiles/standard.md'],
};

test('benchmark guidance has one canonical owner in representative simultaneous loads', async () => {
  const files = new Set(Object.values(bundles).flat());
  const contents = new Map(await Promise.all([...files].map(async (file) => [file, await source(file)])));

  for (const directive of directives) {
    assert.ok((contents.get(directive.owner) ?? await source(directive.owner)).includes(directive.marker), `${directive.id} is missing from ${directive.owner}`);
    for (const [bundleName, bundleFiles] of Object.entries(bundles)) {
      if (!bundleFiles.includes(directive.owner)) continue;
      const count = bundleFiles.reduce((total, file) => total + contents.get(file).split(directive.marker).length - 1, 0);
      assert.equal(count, 1, `${bundleName} must load ${directive.id} exactly once`);
    }
  }

  for (const directive of semanticOwners) {
    for (const [bundleName, owner] of Object.entries(directive.owners)) {
      const bundleFiles = bundles[bundleName];
      const occurrences = bundleFiles.flatMap((file) => [...contents.get(file).matchAll(directive.expression)].map(() => file));
      assert.deepEqual(occurrences, [owner], `${bundleName} must load ${directive.id} once from ${owner}; saw ${occurrences.join(', ') || 'none'}`);
    }
  }
});

test('fresh Claude and Codex builds contain the intended benchmark guidance', async (context) => {
  const output = await mkdtemp(path.join(tmpdir(), 'aer-guidance-'));
  context.after(() => rm(output, { recursive: true, force: true }));
  await build(output);

  for (const directive of directives) {
    for (const generated of generatedOwners[directive.owner] ?? []) {
      assert.ok((await readFile(path.join(output, generated), 'utf8')).includes(directive.marker), `${generated} omits ${directive.id}`);
    }
  }

  const webProtections = [
    'DOM text APIs or framework escaping',
    'block persistence until recovery',
    'every pointer interaction an equivalent keyboard path',
    'closes a dialog or drawer',
    '`<body>` strands keyboard users',
    '`:focus-visible`',
    '`prefers-reduced-motion`',
    'Implement only reachable loading, empty, error, success, and disabled states',
  ];
  for (const host of ['claude', 'codex']) {
    const web = await readFile(path.join(output, host, 'agent-rules/reference/web-ui.md'), 'utf8');
    for (const protection of webProtections) assert.ok(web.includes(protection), `${host} Web UI omits ${protection}`);
  }

  const codexRoot = await readFile(path.join(output, 'codex/AGENTS.md'), 'utf8');
  const claudeRoot = await readFile(path.join(output, 'claude/CLAUDE.md'), 'utf8');
  assert.match(codexRoot, /TypeScript or React only after the stack is selected or already present/);
  assert.match(codexRoot, /Durable behavior or meaningful regression exposure: `agent-rules\/reference\/testing\.md`/);
  assert.match(claudeRoot, /stack references only after that stack is selected or already present/i);
  assert.match(claudeRoot, /reference\/security\.md.*untrusted input, persistence, or trust boundaries/i);
  assert.doesNotMatch(codexRoot, /matching verification contract/);
  assert.doesNotMatch(claudeRoot, /matching verification contract/);
  for (const skill of ['claude/.claude/skills/aer-verify/SKILL.md', 'codex/.agents/skills/aer-verify/SKILL.md']) {
    assert.match(await readFile(path.join(output, skill), 'utf8'), /description: .*matching verification contract/);
  }
});

test('static HTML and React routing remain conditional and progressively disclosed', async () => {
  const web = MANIFEST.contexts.find((context) => context.name === 'web-ui');
  const react = MANIFEST.contexts.find((context) => context.name === 'typescript-react');
  assert.ok(web.paths.includes('**/*.html'));
  assert.ok(web.paths.includes('**/*.css'));
  assert.ok(react.paths.includes('**/*.ts'));
  assert.ok(react.paths.includes('**/*.tsx'));
  assert.ok(react.paths.includes('**/*.jsx'));

  const claudeStaticRoute = await source('contexts/claude-web-ui.md');
  const claudeReactRoute = await source('contexts/claude-typescript-react.md');
  assert.match(claudeStaticRoute, /for TypeScript or React, also read/);
  assert.match(claudeReactRoute, /matching TypeScript or React file/);
  assert.doesNotMatch(claudeStaticRoute, /AE-\d{2}/);
  assert.doesNotMatch(claudeReactRoute, /AE-\d{2}/);
});
