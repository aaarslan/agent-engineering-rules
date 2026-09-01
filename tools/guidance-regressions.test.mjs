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
  { id: 'three-line-ui-outcome', owner: 'skills/ui-styling.md', marker: 'exactly three concise outcome lines' },
  { id: 'ui-known-defect', owner: 'skills/ui-styling.md', marker: 'strongest demonstrated result and any known defect' },
  { id: 'real-ui-transition', owner: 'contexts/web-ui.md', marker: 'Exercise the promised state transition, not an acknowledgement' },
  { id: 'named-destination-transition', owner: 'contexts/web-ui.md', marker: '`action → named visible destination state`' },
  { id: 'acknowledgement-is-not-proof', owner: 'contexts/web-ui.md', marker: 'A toast, form reset, command exit code, or success message alone is acknowledgement, not proof' },
  { id: 'mobile-overflow', owner: 'contexts/web-ui.md', marker: '`document.documentElement.scrollWidth` with `document.documentElement.clientWidth`' },
  { id: 'responsive-route-activation', owner: 'contexts/web-ui.md', marker: 'discoverable, keyboard- and pointer-reachable, and activates its intended target' },
  { id: 'local-scroll-separation', owner: 'contexts/web-ui.md', marker: 'document overflow separately from intentional local table or chart scrolling' },
  { id: 'residual-sink-disposition', owner: 'contexts/web-ui.md', marker: 'explicit disposition for every residual finding fingerprint' },
  { id: 'unresolved-sink-blocks-clean', owner: 'contexts/web-ui.md', marker: 'An unresolved sink blocks a clean claim' },
  { id: 'honest-controls', owner: 'contexts/web-ui.md', marker: 'Do not add an inert hamburger, export, navigation, or action control merely for polish' },
  { id: 'scoped-contrast', owner: 'contexts/web-ui.md', marker: 'selected named opaque foreground/background pairs' },
  { id: 'scoped-slop-scan', owner: 'contexts/web-ui.md', marker: 'only when supported web files and relevant risks such as unsafe sinks' },
  { id: 'local-prototype-resources', owner: 'contexts/web-ui.md', marker: 'For a self-contained prototype, prefer system fonts and local assets' },
  { id: 'disposable-test-files', owner: 'quality/testing.md', marker: 'a disposable mockup need not add durable test files' },
  { id: 'classified-cli-outcome', owner: 'workflow/verification.md', marker: 'Before first use of a shipped CLI, inspect its `--help`' },
  { id: 'canonical-shipped-tools', owner: 'workflow/verification.md', marker: 'The canonical shipped-tool invocations are' },
  { id: 'batched-standard-ui-validation', owner: 'workflow/verification.md', marker: 'one applicable full-root slop scan and one batched contrast check' },
  { id: 'failure-preserving-components', owner: 'workflow/verification.md', marker: "Preserve each component command's exit status and material output" },
  { id: 'bounded-build-contract', owner: 'workflow/verification.md', marker: 'terminate successfully within a bounded check and produce its declared output' },
  { id: 'untracked-authored-files', owner: 'skills/feature.md', marker: 'Enumerate and validate every untracked file authored by the task directly' },
  { id: 'dependency-reproducibility', owner: 'skills/feature.md', marker: "retain the resolver lockfile or follow the repository's exact-pin policy" },
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

const provesPromptTransition = (evidence) => Boolean(
  evidence.action && evidence.destinationName && evidence.visibleDestinationState,
);

const missingResponsiveDestinations = (required, observed) => required.filter((name) => {
  const destination = observed.find((candidate) => candidate.name === name);
  return !destination?.discoverable
    || !destination.keyboardReachable
    || !destination.pointerReachable
    || destination.activatedTarget !== name;
});

function renderingDispositionSupportsCompletion(disposition) {
  if (disposition.classification === 'removed') return disposition.present === false;
  if (disposition.classification === 'safely-escaped') return Boolean(disposition.mechanism);
  if (disposition.classification === 'trusted-static') {
    return Boolean(disposition.boundary)
      && disposition.sources.every((sourceKind) => sourceKind === 'static-fixture');
  }
  return false;
}

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
    const verification = await readFile(path.join(output, host, 'agent-rules/reference/verification.md'), 'utf8');
    for (const canonical of [
      'node agent-rules/tools/slop-scan.mjs --root .',
      'node agent-rules/tools/contrast-check.mjs --batch contrast-pairs.json',
      'node agent-rules/tools/file-size-guard.mjs --check src/app.js src/view.tsx',
    ]) assert.ok(verification.includes(canonical), `${host} verification omits canonical consumer invocation: ${canonical}`);
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

test('prompt-critical transition guidance rejects acknowledgement-only evidence', async () => {
  const web = await source('contexts/web-ui.md');
  for (const requestedTransition of [
    /save note → note appears in the named notes region/,
    /submit a log → entry appears in the named log/,
    /add hydration → displayed hydration state changes/,
    /search or filter → visible results change/,
    /activate navigation → intended named destination opens/,
  ]) assert.match(web, requestedTransition);
  assert.match(web, /toast, form reset, command exit code, or success message alone is acknowledgement, not proof/);
  assert.equal(provesPromptTransition({ action: 'Save note', acknowledgement: 'Saved' }), false);
  assert.equal(provesPromptTransition({
    action: 'Save note', destinationName: 'Notes', visibleDestinationState: 'Literal note text',
  }), true);
});

test('desktop sidebar transformed at 390x844 must retain and activate required routes', async () => {
  const web = await source('contexts/web-ui.md');
  const seededScenario = {
    viewport: { width: 390, height: 844 },
    sourceForm: 'desktop sidebar',
    defect: 'containment hides prompt-required destinations',
  };
  assert.deepEqual(seededScenario.viewport, { width: 390, height: 844 });
  const required = ['Home', 'Subscriptions', 'Customers', 'Settings'];
  const transformed = required.map((name) => ({
    name, discoverable: true, keyboardReachable: true, pointerReachable: true, activatedTarget: name,
  }));
  assert.deepEqual(missingResponsiveDestinations(required, transformed), []);
  assert.deepEqual(missingResponsiveDestinations(required, transformed.map((destination) => (
    destination.name === 'Customers' ? { ...destination, discoverable: false } : destination
  ))), ['Customers']);
  assert.match(web, /At every relevant narrow breakpoint, enumerate prompt-required destination names/);
  assert.match(web, /discoverable, keyboard- and pointer-reachable, and activates its intended target/);
  assert.match(web, /containment fix that hides required navigation fails validation/);
  assert.match(web, /document overflow separately from intentional local table or chart scrolling/);
});

test('residual rendering sinks require complete fingerprint disposition', async () => {
  const web = await source('contexts/web-ui.md');
  for (const disposition of [
    /removed \(absent on rerun\)/,
    /safely escaped by a named mechanism/,
    /trusted static data inside a defined immutable boundary that never receives user, server, or external data/,
    /or unresolved/,
  ]) assert.match(web, disposition);
  assert.equal(renderingDispositionSupportsCompletion({
    classification: 'trusted-static', boundary: 'immutable fixture module', sources: ['static-fixture'],
  }), true);
  for (const sourceKind of ['user', 'server', 'external']) {
    assert.equal(renderingDispositionSupportsCompletion({
      classification: 'trusted-static', boundary: 'fixture claim', sources: [sourceKind],
    }), false);
  }
  assert.equal(renderingDispositionSupportsCompletion({ classification: 'safely-escaped', mechanism: 'textContent' }), true);
  assert.equal(renderingDispositionSupportsCompletion({ classification: 'removed', present: false }), true);
  assert.equal(renderingDispositionSupportsCompletion({ classification: 'unresolved' }), false);
  assert.match(web, /clean applicable full-root rerun or an explicit disposition for every residual finding fingerprint/);
  assert.match(web, /An unresolved sink blocks a clean claim/);
});

test('verification guidance preserves component failures and reproducible build evidence', async () => {
  const verification = await source('workflow/verification.md');
  assert.match(verification, /later success cannot mask an earlier failure/);
  assert.match(verification, /Keep not applicable, advisory, failure, and clean distinct/);
  assert.match(verification, /node tools\/slop-scan\.mjs --root \./);
  assert.match(verification, /node tools\/contrast-check\.mjs --batch contrast-pairs\.json/);
  assert.match(verification, /node tools\/file-size-guard\.mjs --check src\/app\.js src\/view\.tsx/);
  assert.match(verification, /development server running is a development command and fails build validation/);
});

test('feature and UI reporting guidance reject unreproducible and proxy verdicts', async () => {
  const feature = await source('skills/feature.md');
  const ui = await source('skills/ui-styling.md');
  assert.match(feature, /Enumerate and validate every untracked file authored by the task directly/);
  assert.match(feature, /npm `latest` dist-tags, without a lock do not qualify as reproducible/);
  assert.match(ui, /exactly three concise outcome lines/);
  for (const dimension of [
    /Composition and form factor/,
    /Functional and responsive behavior/,
    /Engineering, accessibility, and safety/,
  ]) assert.match(ui, dimension);
  assert.match(ui, /validation volume are not quality verdicts/);
  assert.match(ui, /strongest demonstrated result and any known defect/);
});
