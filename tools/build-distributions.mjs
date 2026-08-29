#!/usr/bin/env node
// Generates the Claude Code and Codex distributions in dist/ from source/.
// Dependency-free and deterministic: same source in, byte-identical dist out.
// The MANIFEST below is the single mapping authority from source files to
// host-native locations. Edit source/, edit MANIFEST if the mapping changes,
// then run: node tools/build-distributions.mjs [outputRoot]

import { lstat, mkdir, readFile, realpath, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = {
  defaultProfile: 'standard',
  // Always-active policy, in order. Claude: one rule file each (always loaded).
  // Codex: concatenated into the generated AGENTS.md via the root template.
  core: [
    'kernel/contract.md',
  ],
  // Task skills. Frames live in source/skills/<name>.md (frontmatter: name,
  // description). `claude` holds Claude-only frontmatter extras.
  skills: [
    { name: 'feature', claude: {} },
    { name: 'bug-fix', claude: {} },
    { name: 'refactor', claude: {} },
    // Review-only skills fork into the custom read-only reviewer. Its explicit
    // tool allowlist excludes shells, delegation, MCP tools, and write tools.
    { name: 'pr-review', claude: { disableModelInvocation: true, context: 'fork', agent: 'code-reviewer', background: false } },
    { name: 'data-change', claude: { paths: ['**/migrations/**', 'db/**', 'prisma/**', '**/*.sql'] } },
    { name: 'aer-security-review', claude: { disableModelInvocation: true, context: 'fork', agent: 'code-reviewer', background: false } },
    { name: 'aer-verify', claude: {} },
    { name: 'autonomous-mission', claude: { disableModelInvocation: true } },
    { name: 'doc-update', claude: {} },
    { name: 'ui-styling', claude: {} },
  ],
  // Stack contexts. Claude: path-scoped pointer rules (adjust globs to the
  // host repo). Both hosts receive the full on-demand reference authority.
  contexts: [
    { name: 'web-ui', source: 'contexts/web-ui.md', ruleSource: 'contexts/claude-web-ui.md', references: ['contexts/web-ui.md', 'contexts/typescript-react.md'], requires: ['typescript-react'], rule: 'context-web-ui.md', paths: ['**/*.tsx', '**/*.jsx', '**/*.html', '**/*.css', '**/*.vue', '**/*.svelte'] },
    { name: 'typescript-react', source: 'contexts/typescript-react.md', ruleSource: 'contexts/claude-typescript-react.md', references: ['contexts/typescript-react.md', 'contexts/web-ui.md'], requires: ['web-ui'], rule: 'context-typescript-react.md', paths: ['**/*.ts', '**/*.tsx', '**/*.jsx'] },
    { name: 'backend-api', source: 'contexts/backend-api.md', ruleSource: 'contexts/claude-backend-api.md', references: ['contexts/backend-api.md', 'quality/security.md'], requires: [], rule: 'context-backend-api.md', paths: ['**/api/**', '**/server/**', '**/routes/**', '**/controllers/**', '**/handlers/**', '**/services/**'] },
  ],
  // On-demand references shipped in both distributions under agent-rules/reference/.
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
  // Repository-only research inputs. They are validated and used by the
  // provider-free evaluation harness, but are never copied into installs.
  research: [
    'compatibility/hosts.json',
    'compatibility/models.json',
    'compatibility/conflicts.json',
    'policy/policy-map.json',
    'evals/scenarios.json',
    'evals/directives.json',
    'evals/treatments.json',
    'evals/experiments.v2.json',
    'evals/cells.v2.json',
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
  tools: ['tools/contrast-check.mjs', 'tools/slop-scan.sh', 'tools/file-size-guard.py'],
  agents: [
    // Read, Grep, Glob only: Bash would grant effective write access through
    // redirection, defeating the enforced read-only contract.
    { name: 'code-reviewer', template: 'templates/code-reviewer.md', description: 'Evidence-backed read-only code review. Use for reviewing diffs, PRs, or changed code without edit access.', tools: 'Read, Grep, Glob' },
  ],
};

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repo, 'source');
// Text rewrites applied everywhere: source-relative utility paths become
// dist-relative paths that exist in the installed layout.
const REWRITES = [
  ['tools/contrast-check.mjs', 'agent-rules/tools/contrast-check.mjs'],
  ['tools/slop-scan.sh', 'agent-rules/tools/slop-scan.sh'],
  ['tools/file-size-guard.py', 'agent-rules/tools/file-size-guard.py'],
];

const read = (rel) => readFile(path.join(src, rel), 'utf8');

export function stripFrontmatter(text) {
  const rows = text.split(/\r?\n/);
  if (rows[0] !== '---') return text.trim() + '\n';
  const end = rows.indexOf('---', 1);
  if (end < 0) return text.trim() + '\n';
  return rows.slice(end + 1).join('\n').trim() + '\n';
}

export function frontmatterFields(text) {
  const rows = text.split(/\r?\n/), fields = {};
  if (rows[0] !== '---') return fields;
  const end = rows.indexOf('---', 1);
  for (const row of rows.slice(1, end)) {
    const m = row.match(/^([a-z_-]+):\s*(.+)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

const demote = (text) => text.replace(/^(#{1,5})\s/gm, '$1# ');

// Relative markdown links cannot survive relocation. Keep absolute URLs.
// If the target's basename is a shipped sibling (reference/), relink to it;
// otherwise flatten the link to its label.
function relink(text, siblingBasenames = new Set()) {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (whole, label, target) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return whole; // absolute URL
    const base = path.basename(target.split('#')[0]);
    if (siblingBasenames.has(base)) return `[${label}](${base})`;
    return label;
  });
}

const escapePattern = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function rewriteToolPaths(text) {
  return REWRITES.reduce((rewritten, [from, to]) => {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_./-])(\\./)?${escapePattern(from)}(?=$|[^A-Za-z0-9_./-])`, 'g');
    return rewritten.replace(pattern, (match, boundary, dotPrefix = '') => `${boundary}${dotPrefix}${to}`);
  }, text);
}

const manifestLists = ['core', 'skills', 'contexts', 'reference', 'profiles', 'research', 'tools', 'agents'];
const windowsDevice = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/i;
const destinationBasename = (value) => typeof value === 'string' ? path.posix.basename(value) : '<invalid>';
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function portableRelativePathError(value) {
  if (typeof value !== 'string' || !value) return 'must be a non-empty string';
  if (/[\x00-\x1f\x7f]/.test(value)) return 'contains control characters';
  if (value.includes('\\')) return 'uses a backslash; use portable forward slashes';
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/.test(value)) return 'must be relative, not absolute, drive-relative, or UNC';
  if (path.posix.normalize(value) !== value) return 'must not contain empty, dot, or parent segments';
  const segments = value.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return 'must not contain empty, dot, or parent segments';
  if (segments.some((segment) => /[<>:"|?*]/.test(segment))) return 'contains characters invalid in Windows path components';
  if (segments.some((segment) => /[. ]$/.test(segment))) return 'contains a Windows-aliased trailing dot or space';
  if (segments.some((segment) => windowsDevice.test(segment))) return 'contains a reserved Windows device component';
  return null;
}

function buildDestinationClaims(manifest = MANIFEST) {
  const claims = [];
  const claim = (host, relative, origin) => claims.push({ host, relative, origin });
  const list = (name) => Array.isArray(manifest?.[name]) ? manifest[name] : [];

  for (const host of ['claude', 'codex']) {
    list('reference').forEach((source, index) => claim(host, `agent-rules/reference/${destinationBasename(source)}`, `reference[${index}] ${source}`));
    list('profiles').forEach((source, index) => claim(host, `agent-rules/profiles/${destinationBasename(source)}`, `profiles[${index}] ${source}`));
    list('tools').forEach((source, index) => claim(host, `agent-rules/tools/${destinationBasename(source)}`, `tools[${index}] ${source}`));
    list('skills').forEach((skill, index) => {
      const name = skill?.name;
      const relative = host === 'claude' ? `.claude/skills/${name}/SKILL.md` : `.agents/skills/${name}/SKILL.md`;
      claim(host, relative, `skills[${index}] ${name}`);
    });
  }

  list('core').forEach((source, index) => claim('claude', `.claude/rules/core-${destinationBasename(source)}`, `core[${index}] ${source}`));
  list('contexts').forEach((context, index) => claim('claude', `.claude/rules/${context?.rule}`, `contexts[${index}] ${context?.ruleSource}`));
  claim('claude', '.claude/rules/profile.md', 'active default profile');
  list('agents').forEach((agent, index) => claim('claude', `.claude/agents/${agent?.name}.md`, `agents[${index}] ${agent?.template}`));
  claim('claude', 'CLAUDE.md', 'Claude root');
  claim('codex', 'AGENTS.md', 'Codex root');
  return claims;
}

function buildSourceClaims(manifest = MANIFEST) {
  const claims = [];
  const claim = (root, relative, origin, composed = false) => claims.push({ root, relative, origin, composed });
  const list = (name) => Array.isArray(manifest?.[name]) ? manifest[name] : [];

  list('core').forEach((relative, index) => claim('source', relative, `core[${index}]`, true));
  list('reference').forEach((relative, index) => claim('source', relative, `reference[${index}]`, true));
  list('profiles').forEach((relative, index) => claim('source', relative, `profiles[${index}]`, true));
  list('research').forEach((relative, index) => claim('source', relative, `research[${index}]`));
  list('tools').forEach((relative, index) => claim('repository', relative, `tools[${index}]`));
  list('skills').forEach((skill, index) => claim('source', `skills/${skill?.name}.md`, `skills[${index}] derived source`, true));
  list('contexts').forEach((context, index) => {
    claim('source', context?.source, `contexts[${index}].source`, true);
    claim('source', context?.ruleSource, `contexts[${index}].ruleSource`, true);
  });
  list('agents').forEach((agent, index) => claim('source', agent?.template, `agents[${index}].template`, true));
  claim('source', `profiles/${manifest.defaultProfile}.md`, 'active default profile', true);
  claim('source', 'templates/claude-root.md', 'Claude root', true);
  claim('source', 'templates/codex-root.md', 'Codex root', true);
  return claims;
}

export function buildDestinationPathErrors(manifest = MANIFEST) {
  const errors = [];
  for (const name of manifestLists) {
    if (!Array.isArray(manifest?.[name])) errors.push(`MANIFEST.${name} must be an array`);
  }

  for (const claim of buildSourceClaims(manifest)) {
    const reason = portableRelativePathError(claim.relative);
    if (reason) errors.push(`${claim.origin} path ${JSON.stringify(claim.relative)} ${reason}`);
  }
  for (const [kind, entries] of [
    ['skill', Array.isArray(manifest?.skills) ? manifest.skills : []],
    ['agent', Array.isArray(manifest?.agents) ? manifest.agents : []],
  ]) {
    entries.forEach((entry, index) => {
      if (typeof entry?.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name)) {
        errors.push(`${kind}s[${index}].name ${JSON.stringify(entry?.name)} must be one flat lowercase alphanumeric-hyphen identifier`);
      }
    });
  }

  for (const claim of buildDestinationClaims(manifest)) {
    const reason = portableRelativePathError(claim.relative);
    if (reason) errors.push(`${claim.host}/${claim.relative} from ${claim.origin} ${reason}`);
  }
  return errors.sort(compareText);
}

export function buildDestinationCollisions(manifest = MANIFEST) {
  const claims = buildDestinationClaims(manifest).map(({ host, relative, origin }) => {
    const destination = `${host}/${relative}`;
    return { key: destination.normalize('NFC').toLowerCase(), destination, origin };
  });

  const grouped = new Map();
  for (const item of claims) {
    if (!grouped.has(item.key)) grouped.set(item.key, []);
    grouped.get(item.key).push(item);
  }
  return [...grouped.values()]
    .filter((items) => items.length > 1)
    .map((items) => ({
      destination: items.map((item) => item.destination).sort(compareText)[0],
      origins: items.map((item) => item.origin).sort(compareText),
    }))
    .sort((left, right) => compareText(left.destination, right.destination));
}

export function assertNoBuildDestinationCollisions(manifest = MANIFEST) {
  const collisions = buildDestinationCollisions(manifest);
  if (!collisions.length) return;
  throw new Error(`build output destination collisions:\n${collisions
    .map((collision) => `  - ${collision.destination}: ${collision.origins.join(', ')}`)
    .join('\n')}`);
}

export function assertBuildDestinations(manifest = MANIFEST) {
  const errors = buildDestinationPathErrors(manifest);
  if (errors.length) {
    throw new Error(`unsafe build output destinations:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
  }
  assertNoBuildDestinationCollisions(manifest);
}

async function sourceRoot(root, label) {
  const absolute = path.resolve(root);
  let info;
  try { info = await lstat(absolute); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`${label} source root is missing: ${absolute}`);
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error(`${label} source root is a symbolic link: ${absolute}`);
  if (!info.isDirectory()) throw new Error(`${label} source root is not a directory: ${absolute}`);
  return { absolute, real: await realpath(absolute), label };
}

async function checkedSourceFile(root, relative, origin) {
  let current = root.absolute;
  let info;
  const target = path.resolve(root.absolute, ...relative.split('/'));
  const lexicalDifference = path.relative(root.absolute, target);
  if (lexicalDifference === '..' || lexicalDifference.startsWith(`..${path.sep}`) || path.isAbsolute(lexicalDifference)) {
    throw new Error(`${origin} source resolves outside ${root.label}: ${relative}`);
  }
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try { info = await lstat(current); }
    catch (error) {
      if (error.code === 'ENOENT') throw new Error(`${origin} source is missing: ${relative}`);
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${origin} source traverses a symbolic link: ${relative}`);
    const final = current === target;
    if (!final && !info.isDirectory()) throw new Error(`${origin} source parent is not a directory: ${relative}`);
  }
  if (!info?.isFile()) throw new Error(`${origin} source is not a regular file: ${relative}`);
  const targetReal = await realpath(current);
  const difference = path.relative(root.real, targetReal);
  if (difference === '..' || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
    throw new Error(`${origin} source resolves outside ${root.label}: ${relative}`);
  }
  try { return await readFile(current); }
  catch (error) { throw new Error(`${origin} source cannot be read: ${relative}: ${error.message}`); }
}

export async function assertBuildSourcePaths(
  manifest = MANIFEST,
  { sourceDirectory = src, repositoryDirectory = repo } = {},
) {
  const claims = buildSourceClaims(manifest);
  const roots = new Map();
  const errors = new Set();
  for (const [name, directory] of [['source', sourceDirectory], ['repository', repositoryDirectory]]) {
    if (!claims.some((claim) => claim.root === name)) continue;
    try { roots.set(name, await sourceRoot(directory, name)); }
    catch (error) { errors.add(error.message); }
  }

  const contents = new Map();
  const visits = new Set();
  const inspect = async (claim, depth = 0) => {
    const reason = portableRelativePathError(claim.relative);
    if (reason) {
      errors.add(`${claim.origin} source path ${JSON.stringify(claim.relative)} ${reason}`);
      return;
    }
    if (depth > 3) {
      errors.add(`${claim.origin} include depth exceeded`);
      return;
    }
    const root = roots.get(claim.root);
    if (!root) return;
    const key = `${claim.root}\0${claim.relative}`;
    let content = contents.get(key);
    if (!content) {
      try {
        content = await checkedSourceFile(root, claim.relative, claim.origin);
        contents.set(key, content);
      } catch (error) {
        errors.add(error.message);
        return;
      }
    }
    if (!claim.composed) return;
    const visitKey = `${key}\0${depth}`;
    if (visits.has(visitKey)) return;
    visits.add(visitKey);
    const core = (Array.isArray(manifest?.core) ? manifest.core : [])
      .map((relative) => `{{include:${relative}}}`).join('\n\n');
    const text = stripFrontmatter(content.toString('utf8')).replaceAll('{{core}}', core);
    for (const match of text.matchAll(/\{\{include:([^}]+)\}\}/g)) {
      await inspect({ root: 'source', relative: match[1].trim(), origin: `include in ${claim.relative}`, composed: true }, depth + 1);
    }
  };
  for (const claim of claims) await inspect(claim);
  if (errors.size) {
    throw new Error(`invalid build source paths:\n${[...errors].sort(compareText).map((error) => `  - ${error}`).join('\n')}`);
  }
}

async function assertSafeOutputRoots(outRoot) {
  const absolute = path.resolve(outRoot);
  try {
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) throw new Error(`unsafe build output root is a symbolic link: ${absolute}`);
    if (!info.isDirectory()) throw new Error(`unsafe build output root is not a directory: ${absolute}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const host of ['claude', 'codex']) {
    const hostRoot = path.join(absolute, host);
    try {
      const info = await lstat(hostRoot);
      if (info.isSymbolicLink()) throw new Error(`unsafe ${host} output root is a symbolic link: ${hostRoot}`);
      if (!info.isDirectory()) throw new Error(`unsafe ${host} output root is not a directory: ${hostRoot}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return absolute;
}

function resolveBuildOutput(root, relative) {
  const reason = portableRelativePathError(relative);
  if (reason) throw new Error(`unsafe build output destination ${relative}: ${reason}`);
  const absoluteRoot = path.resolve(root);
  const file = path.resolve(absoluteRoot, ...relative.split('/'));
  const difference = path.relative(absoluteRoot, file);
  if (difference === '..' || difference.startsWith(`..${path.sep}`) || path.isAbsolute(difference)) {
    throw new Error(`unsafe build output destination ${relative}: resolved path escapes its host root`);
  }
  return file;
}

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
  if (manifest.defaultProfile !== 'standard') errors.push('defaultProfile must be the canonical standard profile');

  for (const [index, context] of contexts.entries()) {
    const name = names[index];
    if (!/^[a-z0-9-]{1,64}$/.test(name)) errors.push(`contexts[${index}] name must be a stable lowercase alphanumeric-hyphen identifier`);
    if (!canonicalSourcePath(context.source, 'contexts/')) errors.push(`contexts[${index}] source is unsafe; use a canonical repository-relative Markdown path under contexts/`);
    else if (!references.has(context.source)) errors.push(`contexts[${index}] source "${context.source}" is not shipped in MANIFEST.reference`);
    if (references.has(context.ruleSource)) errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" must remain a thin Claude route, not a full on-demand reference`);
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

export function thinContextRouteErrors(text) {
  const errors = [];
  const bytes = Buffer.byteLength(text, 'utf8');
  const lines = text.split(/\r?\n/).length;
  const body = stripFrontmatter(text).trim();
  const bodyLines = body.split(/\r?\n/).filter((line) => line.trim());
  if (bytes > 1024) errors.push(`thin route is ${bytes} bytes; maximum is 1024`);
  if (lines > 12) errors.push(`thin route is ${lines} lines; maximum is 12`);
  if (bodyLines.length !== 2 || !/^# [^#]/.test(bodyLines[0]) || /^\s*(?:[-*+]|\d+\.)\s/.test(bodyLines[1])) {
    errors.push('thin route body must contain one level-one heading and one routing paragraph');
  }
  if (!/\bread\b/i.test(bodyLines[1] ?? '')) errors.push('thin route paragraph must direct the host to read its full reference');
  if (/\bAE-\d{2}\b|\{\{(?:include|core)\b/i.test(text)) {
    errors.push('thin route must not duplicate rule authorities or include composed rule prose');
  }
  return errors;
}

export async function contextRuleSourceErrors(manifest = MANIFEST, sourceDirectory = src) {
  const errors = contextRuleSourcePathErrors(manifest);
  const unsafeIndexes = new Set(errors.map((error) => Number(error.match(/^contexts\[(\d+)\]/)?.[1])).filter(Number.isInteger));
  let sourceReal;
  try { sourceReal = await realpath(sourceDirectory); }
  catch { sourceReal = path.resolve(sourceDirectory); }
  for (const [index, context] of (manifest.contexts ?? []).entries()) {
    if (unsafeIndexes.has(index)) continue;
    try {
      let current = sourceDirectory;
      let info;
      for (const segment of context.ruleSource.split('/')) {
        current = path.join(current, segment);
        info = await lstat(current);
        if (info.isSymbolicLink()) throw Object.assign(new Error('symbolic link traversal'), { code: 'AER_UNSAFE_SYMLINK' });
      }
      const targetReal = await realpath(current);
      const relative = path.relative(sourceReal, targetReal);
      if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) {
        errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" is unsafe; resolved path escapes source/`);
      } else if (!info.isFile()) {
        errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" is missing; expected a source file`);
      } else {
        const route = await readFile(current, 'utf8');
        for (const error of thinContextRouteErrors(route)) errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" ${error}`);
      }
    } catch {
      const candidate = path.join(sourceDirectory, context.ruleSource);
      try {
        let current = sourceDirectory;
        for (const segment of context.ruleSource.split('/')) {
          current = path.join(current, segment);
          if ((await lstat(current)).isSymbolicLink()) throw new Error('unsafe');
        }
        await lstat(candidate);
        errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" is unsafe; symbolic-link traversal is not allowed`);
      } catch (error) {
        if (error.message === 'unsafe') errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" is unsafe; symbolic-link traversal is not allowed`);
        else errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" is missing; expected a source file`);
      }
    }
  }
  return errors;
}

export async function assertContextManifest(manifest = MANIFEST, sourceDirectory = src) {
  const errors = [...contextManifestErrors(manifest), ...await contextRuleSourceErrors(manifest, sourceDirectory)];
  if (!errors.length) return;
  throw new Error(`invalid context manifest entries:\n${errors.map((error) => `  - ${error}`).join('\n')}`);
}

async function resolveIncludes(text, depth = 0) {
  if (depth > 3) throw new Error('include depth exceeded');
  // {{core}} expands to the always-active policy so the Codex root can never
  // drift from MANIFEST.core (the Claude rules are generated from it directly).
  text = text.replaceAll('{{core}}', MANIFEST.core.map((f) => `{{include:${f}}}`).join('\n\n'));
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(/\{\{include:([^}]+)\}\}/g)) {
    parts.push(text.slice(last, m.index));
    const body = stripFrontmatter(await read(m[1].trim()));
    parts.push(demote(await resolveIncludes(body, depth + 1)).trim());
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts.join('');
}

async function composed(rel, siblings) {
  const body = stripFrontmatter(await read(rel));
  return rewriteToolPaths(relink(await resolveIncludes(body), siblings)).trim() + '\n';
}

// Canonical instruction body used by the provider-free evaluation archive.
// Host container frontmatter is deliberately excluded; body composition is
// otherwise identical to the distribution builder (includes, links, paths).
let evaluationCompositionPreflight;
export async function composeEvaluationComponent(rel) {
  const allowed = buildSourceClaims().some((claim) => claim.root === 'source' && claim.composed && claim.relative === rel);
  if (!allowed) throw new Error(`evaluation component is not a declared composed source: ${rel}`);
  evaluationCompositionPreflight ??= assertBuildSourcePaths();
  await evaluationCompositionPreflight;
  return Buffer.from(await composed(rel, new Set()), 'utf8');
}

function skillFrontmatter(name, description, extras = {}) {
  const lines = ['---', `name: ${name}`, `description: ${description}`];
  if (extras.allowedTools) lines.push(`allowed-tools: ${extras.allowedTools}`);
  if (extras.disallowedTools) lines.push(`disallowed-tools: ${extras.disallowedTools}`);
  if (extras.disableModelInvocation) lines.push('disable-model-invocation: true');
  if (extras.context) lines.push(`context: ${extras.context}`);
  if (extras.agent) lines.push(`agent: ${extras.agent}`);
  if (extras.background !== undefined) lines.push(`background: ${extras.background}`);
  if (extras.paths) { lines.push('paths:'); for (const p of extras.paths) lines.push(`  - "${p}"`); }
  lines.push('---', '');
  return lines.join('\n');
}

async function emit(root, rel, content) {
  const file = resolveBuildOutput(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

export async function build(outRoot = path.join(repo, 'dist')) {
  await assertContextManifest();
  assertBuildDestinations();
  await assertBuildSourcePaths();
  outRoot = await assertSafeOutputRoots(outRoot);
  const claude = path.join(outRoot, 'claude'), codex = path.join(outRoot, 'codex');
  await rm(claude, { recursive: true, force: true });
  await rm(codex, { recursive: true, force: true });

  const refBasenames = new Set(MANIFEST.reference.map(destinationBasename));

  // Shared payload: reference, profiles, tools under agent-rules/.
  for (const host of [claude, codex]) {
    for (const rel of MANIFEST.reference) {
      await emit(host, `agent-rules/reference/${destinationBasename(rel)}`, await composedReference(rel, refBasenames));
    }
    for (const rel of MANIFEST.profiles) {
      await emit(host, `agent-rules/profiles/${destinationBasename(rel)}`, await composed(rel, new Set()));
    }
    for (const rel of MANIFEST.tools) {
      const dest = resolveBuildOutput(host, `agent-rules/tools/${destinationBasename(rel)}`);
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(repo, rel), dest);
    }
  }
  // Skills for both hosts from one frame.
  for (const skill of MANIFEST.skills) {
    const raw = await read(`skills/${skill.name}.md`);
    const meta = frontmatterFields(raw);
    if (meta.name !== skill.name || !meta.description) throw new Error(`skills/${skill.name}.md: frontmatter must define matching name and a description`);
    const body = rewriteToolPaths(relink(await resolveIncludes(stripFrontmatter(raw)))).trim() + '\n';
    await emit(claude, `.claude/skills/${skill.name}/SKILL.md`, skillFrontmatter(skill.name, meta.description, skill.claude) + '\n' + body);
    await emit(codex, `.agents/skills/${skill.name}/SKILL.md`, skillFrontmatter(skill.name, meta.description) + '\n' + body);
  }

  // Claude always-on rules (core), path-scoped rules (contexts), active profile.
  for (const rel of MANIFEST.core) {
    await emit(claude, `.claude/rules/core-${destinationBasename(rel)}`, await composed(rel, new Set()));
  }
  for (const ctx of MANIFEST.contexts) {
    const fm = ['---', 'paths:', ...ctx.paths.map((p) => `  - "${p}"`), '---', '', ''].join('\n');
    await emit(claude, `.claude/rules/${ctx.rule}`, fm + await composed(ctx.ruleSource, new Set()));
  }
  const profileNote = `<!-- Active profile: ${MANIFEST.defaultProfile}. Change it with aer update --profile; do not edit this managed file for a normal profile switch. -->\n\n`;
  await emit(claude, '.claude/rules/profile.md', profileNote + await composed(`profiles/${MANIFEST.defaultProfile}.md`, new Set()));

  // Claude subagents.
  for (const agent of MANIFEST.agents) {
    const fm = ['---', `name: ${agent.name}`, `description: ${agent.description}`, `tools: ${agent.tools}`, '---', '', ''].join('\n');
    await emit(claude, `.claude/agents/${agent.name}.md`, fm + await composed(agent.template, new Set()));
  }

  // Roots.
  await emit(claude, 'CLAUDE.md', await composed('templates/claude-root.md', new Set()));
  await emit(codex, 'AGENTS.md', await composed('templates/codex-root.md', new Set()));
}

async function composedReference(rel, siblings) {
  const body = stripFrontmatter(await read(rel));
  return rewriteToolPaths(relink(await resolveIncludes(body), siblings)).trim() + '\n';
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repo, 'dist');
  build(out).then(
    () => console.log(`BUILT ${path.relative(repo, out) || out}`),
    (error) => { console.error(`BUILD FAILED: ${error.message}`); process.exit(1); },
  );
}
