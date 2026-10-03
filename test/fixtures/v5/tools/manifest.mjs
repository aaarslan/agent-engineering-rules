// Single mapping authority from source files to host-native destinations.
// The builder reads the corpus mappings; the installer also reads the runtime
// mapping so shipped tools have one package source and one installed location.

import path from 'node:path';

export const INSTALLED_RULES_DIRECTORY = 'agent-rules';

export const MANIFEST = {
  defaultProfile: 'standard',
  core: [
    'kernel/contract.md',
  ],
  skills: [
    { name: 'feature', claude: {} },
    { name: 'bug-fix', claude: {} },
    { name: 'refactor', claude: {} },
    { name: 'pr-review', claude: { disableModelInvocation: true, context: 'fork', agent: 'code-reviewer', background: false } },
    { name: 'data-change', claude: { paths: ['**/migrations/**', 'db/**', 'prisma/**', '**/*.sql'] } },
    { name: 'aer-security-review', claude: { disableModelInvocation: true, context: 'fork', agent: 'code-reviewer', background: false } },
    { name: 'aer-verify', claude: { disableModelInvocation: true } },
    { name: 'autonomous-mission', claude: { disableModelInvocation: true } },
    { name: 'doc-update', claude: {} },
    { name: 'ui-styling', claude: {} },
  ],
  contexts: [
    { name: 'web-ui', source: 'contexts/web-ui.md', ruleSource: 'contexts/claude-web-ui.md', obligationSource: 'contexts/web-interaction.md', references: ['contexts/web-ui.md', 'contexts/typescript-react.md'], requires: ['typescript-react'], rule: 'context-web-ui.md', paths: ['**/*.tsx', '**/*.jsx', '**/*.html', '**/*.css', '**/*.vue', '**/*.svelte'] },
    { name: 'typescript-react', source: 'contexts/typescript-react.md', ruleSource: 'contexts/claude-typescript-react.md', references: ['contexts/typescript-react.md', 'contexts/web-ui.md'], requires: ['web-ui'], rule: 'context-typescript-react.md', paths: ['**/*.ts', '**/*.tsx', '**/*.jsx'] },
    { name: 'backend-api', source: 'contexts/backend-api.md', ruleSource: 'contexts/claude-backend-api.md', references: ['contexts/backend-api.md', 'quality/security.md'], requires: [], rule: 'context-backend-api.md', paths: ['**/api/**', '**/server/**', '**/routes/**', '**/controllers/**', '**/handlers/**', '**/services/**'] },
  ],
  reference: [
    'design/principles.md',
    'design/boundaries.md',
    'design/types-and-state.md',
    'design/errors-and-side-effects.md',
    'architecture/decision-making.md',
    'quality/testing.md',
    'quality/security.md',
    'quality/observability.md',
    'quality/performance.md',
    'workflow/review-ledger.md',
    'workflow/design-checkpoint.md',
    'workflow/implementation.md',
    'workflow/verification.md',
    'workflow/skeptic-pass.md',
    'workflow/autonomous-execution.md',
    'agents/orchestration.md',
    'contexts/web-ui.md',
    'contexts/typescript-react.md',
    'contexts/backend-api.md',
    'contexts/database-migrations.md',
    'contexts/pr-review.md',
    'contexts/documentation.md',
    'contexts/ui-styling.md',
  ],
  profiles: ['profiles/prototype.md', 'profiles/standard.md', 'profiles/high-assurance.md'],
  config: ['config/thresholds.json'],
  research: [
    'compatibility/hosts.json',
    'compatibility/models.json',
    'compatibility/conflicts.json',
    'policy/policy-map.json',
    'evals/scenarios.json',
    'evals/directives.json',
    'evals/treatments.json',
    'evals/grievances.json',
    'evals/frozen-history.json',
    'evals/experiments.v2.json',
    'evals/cells.v2.json',
    'evals/components.v2.json',
    'evals/components/v2/kernel/contract.txt',
    'evals/components/v2/profiles/high-assurance.txt',
    'evals/components/v2/profiles/standard.txt',
    'evals/components/v2/skills/aer-security-review.txt',
    'evals/components/v2/skills/aer-verify.txt',
    'evals/components/v2/skills/bug-fix.txt',
    'evals/components/v2/skills/data-change.txt',
    'evals/components/v2/skills/feature.txt',
    'evals/tasks.v2.json',
    'evals/graders.v2.json',
    'evals/run.schema.json',
    'evals/run.example.json',
    'evals/fixtures/repository.v2.json',
    'evals/fixtures/scope-repository.v2.json',
    'evals/fixtures/diagnostic-repository.v2.json',
    'evals/fixtures/evidence-repository.v2.json',
    'evals/fixtures/ingestion-repository.v2.json',
    'evals/fixtures/task-contract.v2.json',
    'evals/fixtures/scope-contract.v2.json',
    'evals/fixtures/diagnostic-contract.v2.json',
    'evals/fixtures/evidence-contract.v2.json',
    'evals/fixtures/ingestion-contract.v2.json',
    'evals/fixtures/task-input.v2.json',
    'evals/fixtures/scope-cases.v2.json',
    'evals/fixtures/diagnostic-cases.v2.json',
    'evals/fixtures/evidence-cases.v2.json',
    'evals/fixtures/ingestion-cases.v2.json',
    'evals/fixtures/expected-artifact.v2.json',
    'evals/fixtures/scope-expected.v2.json',
    'evals/fixtures/diagnostic-expected.v2.json',
    'evals/fixtures/evidence-expected.v2.json',
    'evals/fixtures/ingestion-expected.v2.json',
    'evals/fixtures/grader-rubric.v2.json',
  ],
  // Runtime sources ship once at the npm package root. The installer copies
  // them into a project's managed agent-rules/tools payload.
  tools: [
    'tools/aer-verify.mjs',
    'tools/contrast-check.mjs',
    'tools/slop-scan.mjs',
    'tools/file-size-guard.mjs',
    'tools/lib/thresholds.mjs',
  ],
  agents: [
    { name: 'code-reviewer', template: 'templates/code-reviewer.md', description: 'Evidence-backed read-only code review. Use for reviewing diffs, PRs, or changed code without edit access.', tools: 'Read, Grep, Glob' },
  ],
};

export const destinationBasename = (value) => typeof value === 'string'
  ? path.posix.basename(value)
  : '<invalid>';

export const runtimeDestination = (source) =>
  `${INSTALLED_RULES_DIRECTORY}/${source}`;

export const runtimePayloadPaths = (manifest = MANIFEST) =>
  (Array.isArray(manifest?.tools) ? manifest.tools : [])
    .map((source) => ({ source, destination: runtimeDestination(source) }));

export function contextRuleSourcePathErrors(manifest = MANIFEST) {
  const errors = [];
  for (const [index, context] of (manifest.contexts ?? []).entries()) {
    const value = context.ruleSource;
    if (typeof value !== 'string' || !value) {
      errors.push(`contexts[${index}] ruleSource is missing; expected a repository-relative Markdown path under contexts/`);
      continue;
    }
    const segments = value.split('/');
    const unsafe = value.includes('\\')
      || value.includes('\0')
      || path.posix.isAbsolute(value)
      || path.win32.isAbsolute(value)
      || /^[A-Za-z]:/.test(value)
      || segments.some((segment) => !segment || segment === '.' || segment === '..')
      || !value.startsWith('contexts/')
      || !value.endsWith('.md');
    if (unsafe) errors.push(`contexts[${index}] ruleSource "${value}" is unsafe; use a canonical repository-relative Markdown path under contexts/`);
  }
  return errors;
}

const contextName = (context) => typeof context.name === 'string' ? context.name : '';
const canonicalSourcePath = (value, prefix) => typeof value === 'string'
  && value.length > prefix.length
  && value.startsWith(prefix)
  && value.endsWith('.md')
  && !value.includes('\\')
  && !value.includes('\0')
  && !path.posix.isAbsolute(value)
  && !path.win32.isAbsolute(value)
  && !/^[A-Za-z]:/.test(value)
  && !value.split('/').some((segment) => !segment || segment === '.' || segment === '..');

export function contextManifestErrors(manifest = MANIFEST) {
  const errors = [];
  const contexts = manifest.contexts ?? [];
  const references = new Set(manifest.reference ?? []);
  const names = contexts.map(contextName);
  const nameSet = new Set(names);
  const duplicateNames = names.filter((name, index) => name && names.indexOf(name) !== index);
  if (duplicateNames.length) errors.push(`context names must be unique: ${[...new Set(duplicateNames)].sort().join(', ')}`);
  const ruleSources = contexts.map((context) => context.ruleSource).filter((value) => typeof value === 'string');
  const duplicateRuleSources = ruleSources.filter((value, index) => ruleSources.indexOf(value) !== index);
  if (duplicateRuleSources.length) errors.push(`context ruleSource paths must be unique: ${[...new Set(duplicateRuleSources)].sort().join(', ')}`);
  const obligationSources = contexts.map((context) => context.obligationSource).filter((value) => typeof value === 'string');
  const duplicateObligationSources = obligationSources.filter((value, index) => obligationSources.indexOf(value) !== index);
  if (duplicateObligationSources.length) errors.push(`context obligationSource paths must be unique: ${[...new Set(duplicateObligationSources)].sort().join(', ')}`);
  if (!contexts.find((context) => contextName(context) === 'web-ui')?.obligationSource) errors.push('web-ui context must declare its compact obligationSource');
  if (manifest.defaultProfile !== 'standard') errors.push('defaultProfile must be the canonical standard profile');

  for (const [index, context] of contexts.entries()) {
    const name = names[index];
    if (!/^[a-z0-9-]{1,64}$/.test(name)) errors.push(`contexts[${index}] name must be a stable lowercase alphanumeric-hyphen identifier`);
    if (!canonicalSourcePath(context.source, 'contexts/')) errors.push(`contexts[${index}] source is unsafe; use a canonical repository-relative Markdown path under contexts/`);
    else if (!references.has(context.source)) errors.push(`contexts[${index}] source "${context.source}" is not shipped in MANIFEST.reference`);
    if (references.has(context.ruleSource)) errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" must remain a thin Claude route, not a full on-demand reference`);
    if (context.obligationSource !== undefined) {
      if (!canonicalSourcePath(context.obligationSource, 'contexts/')) errors.push(`contexts[${index}] obligationSource is unsafe; use a canonical repository-relative Markdown path under contexts/`);
      else if (references.has(context.obligationSource)) errors.push(`contexts[${index}] obligationSource "${context.obligationSource}" must remain a compact shared fragment, not a full on-demand reference`);
      if (context.obligationSource === context.source || context.obligationSource === context.ruleSource) errors.push(`contexts[${index}] obligationSource must be distinct from source and ruleSource`);
    }
    if (typeof context.rule !== 'string' || path.posix.basename(context.rule) !== context.rule || !/^context-[a-z0-9-]+\.md$/.test(context.rule)) {
      errors.push(`contexts[${index}] rule is unsafe; use one flat context-*.md filename`);
    }
    if (!Array.isArray(context.paths) || !context.paths.length || context.paths.some((pattern) => typeof pattern !== 'string' || !pattern || /[\x00-\x1f\x7f"\\]/.test(pattern))) {
      errors.push(`contexts[${index}] paths must be non-empty portable single-line glob strings without controls, backslashes, or double quotes`);
    }
    if (!Array.isArray(context.requires) || context.requires.some((required) => typeof required !== 'string') || new Set(context.requires).size !== context.requires.length) {
      errors.push(`contexts[${index}] requires must be an array of unique context names`);
    } else {
      for (const required of context.requires) {
        if (!nameSet.has(required)) errors.push(`contexts[${index}] requires unknown context ${required}`);
        if (required === name) errors.push(`contexts[${index}] must not require itself`);
      }
    }
    if (!Array.isArray(context.references) || !context.references.length || context.references.some((reference) => typeof reference !== 'string') || new Set(context.references).size !== context.references.length) {
      errors.push(`contexts[${index}] references must be a non-empty array of unique MANIFEST.reference sources`);
    } else {
      for (const reference of context.references) if (!references.has(reference)) errors.push(`contexts[${index}] references unshipped source ${reference}`);
      if (!context.references.includes(context.source)) errors.push(`contexts[${index}] references must include its full source ${context.source}`);
      for (const required of Array.isArray(context.requires) ? context.requires : []) {
        const requiredSource = contexts.find((candidate) => contextName(candidate) === required)?.source;
        if (requiredSource && !context.references.includes(requiredSource)) errors.push(`contexts[${index}] references must include required context source ${requiredSource}`);
      }
    }
  }
  return errors;
}
