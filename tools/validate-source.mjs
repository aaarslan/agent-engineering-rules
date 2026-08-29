#!/usr/bin/env node
// Deterministic validation of the canonical corpus in source/.
// Checks frontmatter, include targets, relative links, budgets, and that the
// build manifest covers every source file. Run: node tools/validate-source.mjs

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, contextManifestErrors, contextRuleSourceErrors } from './build-distributions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repo, 'source');
const errors = [];
const problem = (m) => errors.push(m);

// Manifest paths and source directives use `/` on every host. Normalize each
// filesystem-derived relative path at the boundary so classification and set
// membership do not depend on the host path separator.
export function normalizeRepoRelativePath(value) {
  return value.replaceAll('\\', '/');
}

// Files allowed to exist without appearing in the manifest or any include.
const ORPHAN_ALLOWLIST = new Set(['contexts/_template.md']);
const MAX_LINES = { default: 100, skills: 60, templates: 80 };
// Internal source metadata schema for rule files (not emitted to dist).
const SCOPES = new Set(['always', 'any-code-change', 'routed', 'context', 'profile', 'template']);
// Repository docs outside source/ whose relative links must also resolve.
const ROOT_DOCS = ['README.md', 'INSTALL.md', 'ADOPT.md', 'CHANGELOG.md', 'AGENTS.md', 'CLAUDE.md', 'tools/README.md', 'docs/capability-matrix.md', 'docs/evaluation.md'];
const FORKED_REVIEW_SKILLS = new Set(MANIFEST.skills
  .filter((skill) => skill.claude?.context === 'fork' && skill.claude?.agent === 'code-reviewer')
  .map((skill) => skill.name));

export function protectedClaudeSkillCollisions(skillNames, protectedEntryPoints) {
  const protectedNames = new Set(protectedEntryPoints);
  return skillNames.filter((name) => protectedNames.has(name)).sort();
}

export async function walkSourceFiles(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walkSourceFiles(file, files);
    else if (entry.isFile()) files.push(file);
  }
  return files;
}

export function reachableSourceFiles(manifestRoots, includesBySource) {
  const reachable = new Set(manifestRoots);
  const pending = [...reachable];
  while (pending.length) {
    const source = pending.shift();
    for (const target of includesBySource.get(source) ?? []) {
      if (reachable.has(target)) continue;
      reachable.add(target);
      pending.push(target);
    }
  }
  return reachable;
}

export function orphanedSourceFiles(fileNames, manifestRoots, includesBySource, allowlist = ORPHAN_ALLOWLIST) {
  const reachable = reachableSourceFiles(manifestRoots, includesBySource);
  return fileNames.filter((name) => !reachable.has(name) && !allowlist.has(name)).sort();
}

export function generatedReferencePathErrors(text, referenceBasenames) {
  const expectedPaths = new Set([...referenceBasenames].map((name) => `agent-rules/reference/${name}`));
  const found = [];
  for (const match of text.matchAll(/`([^`\r\n]+\.md)`/g)) {
    const target = match[1];
    const normalized = normalizeRepoRelativePath(target);
    if (normalized.startsWith('agent-rules/reference/')) {
      if (!expectedPaths.has(target)) found.push(`generated reference path does not exist: ${target}`);
    } else {
      const basename = path.posix.basename(normalized);
      if (referenceBasenames.has(basename)) found.push(`reference path must be exactly agent-rules/reference/${basename}`);
    }
  }
  return found;
}

export function contextRouteReferenceErrors(text, context, referenceSources) {
  const errors = [];
  const normalizedSource = normalizeRepoRelativePath(context.source ?? '');
  if (!referenceSources.has(normalizedSource)) {
    errors.push(`context source is not shipped as a full on-demand reference: ${normalizedSource || '(missing)'}`);
    return errors;
  }
  const expected = new Set((context.references ?? []).map((source) => `agent-rules/reference/${path.posix.basename(normalizeRepoRelativePath(source))}`));
  const found = new Set([...text.matchAll(/`([^`\r\n]+\.md)`/g)]
    .map((match) => match[1])
    .filter((target) => normalizeRepoRelativePath(target).includes('agent-rules/reference/')));
  for (const destination of expected) if (!found.has(destination)) errors.push(`Claude route omits declared installed full reference \`${destination}\``);
  for (const destination of found) if (!expected.has(destination)) errors.push(`Claude route names undeclared installed reference \`${destination}\``);
  const primaryDestination = `agent-rules/reference/${path.posix.basename(normalizedSource)}`;
  const escaped = primaryDestination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp(`\\bread\\s+\`${escaped}\``, 'i').test(text)) {
    errors.push(`Claude route must explicitly direct the agent to read the installed full reference \`${primaryDestination}\``);
  }
  return errors;
}

export function parseSourceFrontmatter(text) {
  const rows = text.split(/\r?\n/), fields = new Map();
  if (rows[0] !== '---') return null;
  const end = rows.indexOf('---', 1);
  const invalidRows = [];
  for (const row of rows.slice(1, end < 0 ? rows.length : end)) {
    const m = row.match(/^([a-z_-]+):\s*(.*)$/);
    if (m) fields.set(m[1], m[2].trim());
    else if (!/^\s*-\s/.test(row) && row.trim()) invalidRows.push(row);
  }
  return { fields, closed: end >= 0, invalidRows };
}

function frontmatter(text, name) {
  const parsed = parseSourceFrontmatter(text);
  if (parsed === null) return null;
  if (!parsed.closed) problem(`${name}: unclosed frontmatter`);
  for (const row of parsed.invalidRows) problem(`${name}: invalid frontmatter line: ${row}`);
  return parsed.fields;
}

async function main() {
  const files = (await walkSourceFiles(src))
    .map((file) => ({ file, name: normalizeRepoRelativePath(path.relative(src, file)) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const fileNames = new Set(files.map(({ name }) => name));
  const includesBySource = new Map();
  const referenceSources = new Set(MANIFEST.reference.map(normalizeRepoRelativePath));
  const referenceBasenames = new Set([...referenceSources].map((file) => path.posix.basename(file)));
  const hostsDoc = JSON.parse(await readFile(path.join(src, 'compatibility/hosts.json'), 'utf8'));
  const protectedClaudeEntryPoints = hostsDoc.supported_hosts?.claude?.protected_native_entrypoints ?? [];
  for (const name of protectedClaudeSkillCollisions(MANIFEST.skills.map((skill) => skill.name), protectedClaudeEntryPoints)) {
    problem(`Claude project skill ${name} would replace a protected native entrypoint`);
  }
  const canonicalSkills = new Set(MANIFEST.skills.map((skill) => skill.name));
  if (canonicalSkills.size !== 10 || canonicalSkills.size !== MANIFEST.skills.length) {
    problem(`skill inventory must contain exactly 10 unique canonical skills, found ${canonicalSkills.size}`);
  }
  const profileNames = new Set(MANIFEST.profiles.map((source) => path.posix.basename(source, '.md')));
  const expectedProfiles = ['prototype', 'standard', 'high-assurance'];
  if (profileNames.size !== expectedProfiles.length || expectedProfiles.some((name) => !profileNames.has(name))) {
    problem(`profile inventory must contain exactly ${expectedProfiles.join(', ')}`);
  }

  // 1. Manifest closure: every manifest path must exist.
  const manifestPaths = [
    ...MANIFEST.core, ...MANIFEST.reference, ...MANIFEST.profiles,
    ...MANIFEST.contexts.flatMap((c) => [
      ...(typeof c.source === 'string' ? [c.source] : []),
      ...(typeof c.ruleSource === 'string' ? [c.ruleSource] : []),
    ]),
    ...MANIFEST.skills.map((s) => `skills/${s.name}.md`),
    ...MANIFEST.agents.map((a) => a.template),
    ...MANIFEST.research,
    'templates/claude-root.md', 'templates/codex-root.md',
  ].map(normalizeRepoRelativePath);
  const contextRuleSources = new Set(MANIFEST.contexts.map((context) => normalizeRepoRelativePath(context.ruleSource ?? '')));
  for (const p of manifestPaths.filter((candidate) => !contextRuleSources.has(candidate))) {
    if (!fileNames.has(p)) problem(`manifest references missing source file: ${p}`);
  }
  for (const error of [...contextManifestErrors(MANIFEST), ...await contextRuleSourceErrors(MANIFEST, src)]) problem(`manifest ${error}`);
  for (const manifestTool of MANIFEST.tools) {
    const p = normalizeRepoRelativePath(manifestTool);
    try { await stat(path.join(repo, p)); }
    catch { problem(`manifest references missing tool: ${p}`); }
  }

  for (const { file, name } of files) {
    const isMarkdown = name.endsWith('.md');
    const isJson = name.endsWith('.json');
    if (!isMarkdown && !isJson) {
      problem(`${name}: unsupported source file type; add it to an explicit source schema or move it outside source/`);
      continue;
    }
    const text = await readFile(file, 'utf8');
    if (!text.trim()) { problem(`${name}: empty file`); continue; }
    if (isJson) {
      try { JSON.parse(text); }
      catch (error) { problem(`${name}: invalid JSON: ${error.message}`); }
      continue;
    }

    // 2. Frontmatter rules.
    const isTemplate = name.startsWith('templates/');
    const isSkill = name.startsWith('skills/');
    const fields = frontmatter(text, name);
    if (!isTemplate && fields === null) problem(`${name}: missing frontmatter`);
    if (!isTemplate && !isSkill && fields) {
      // Rule files keep the internal scope/load_when/related metadata schema.
      const scope = fields.get('scope') ?? '';
      const scopeValues = scope.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
      if (!scopeValues.length) problem(`${name}: missing scope`);
      for (const value of scopeValues) if (!SCOPES.has(value)) problem(`${name}: unknown scope value "${value}"`);
      if (!fields.get('load_when')) problem(`${name}: missing load_when`);
      const related = fields.get('related');
      if (related === undefined) problem(`${name}: missing related (use [] when empty)`);
      else for (const target of related.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean)) {
        try { await stat(path.resolve(path.dirname(file), target)); }
        catch { problem(`${name}: related target missing: ${target}`); }
      }
    }
    if (isSkill && fields) {
      const expected = path.posix.basename(name, '.md');
      const manifestSkill = MANIFEST.skills.find((skill) => skill.name === expected);
      if (fields.get('name') !== expected) problem(`${name}: frontmatter name must be "${expected}"`);
      const description = fields.get('description') ?? '';
      if (!description) problem(`${name}: missing description`);
      if (description.length > 1024) problem(`${name}: description exceeds 1024 characters`);
      if (!/^[a-z0-9-]{1,64}$/.test(expected)) problem(`${name}: skill name must be lowercase alphanumeric/hyphen, max 64 chars`);
      if (FORKED_REVIEW_SKILLS.has(expected)) {
        if (!text.includes('$ARGUMENTS')) problem(`${name}: forked review skill must inject an explicit caller scope with $ARGUMENTS`);
        if (manifestSkill?.claude?.context !== 'fork' || manifestSkill.claude.agent !== 'code-reviewer' || manifestSkill.claude.background !== false || !manifestSkill.claude.disableModelInvocation) {
          problem(`${name}: Claude review skill must be explicit-only and use the foreground code-reviewer fork`);
        }
      }
    }

    // Every generated prose surface can advertise installed reference paths,
    // not only skills. Require the exact flat destination emitted by the build.
    for (const error of generatedReferencePathErrors(text, referenceBasenames)) problem(`${name}: ${error}`);
    const routeContext = MANIFEST.contexts.find((context) => normalizeRepoRelativePath(context.ruleSource ?? '') === name);
    if (routeContext) for (const error of contextRouteReferenceErrors(text, routeContext, referenceSources)) problem(`${name}: ${error}`);

    // 3. Include targets exist; record graph edges. Reachability is computed
    // later from manifest roots only, so orphan cycles and template-only
    // includes cannot make unshipped files appear used.
    const includeTargets = [];
    for (const m of text.matchAll(/\{\{include:([^}]+)\}\}/g)) {
      const target = normalizeRepoRelativePath(m[1].trim());
      includeTargets.push(target);
      if (!fileNames.has(target)) problem(`${name}: include target missing: ${target}`);
    }
    includesBySource.set(name, includeTargets);

    // 4. Relative links resolve within source/.
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = m[1].trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const dest = path.resolve(path.dirname(file), target.split('#')[0]);
      try { await stat(dest); }
      catch { problem(`${name}: broken relative link: ${target}`); }
    }

    // 5. Budgets: rules stay short by contract.
    const lineCount = text.split('\n').length;
    const limit = isSkill ? MAX_LINES.skills : isTemplate ? MAX_LINES.templates : MAX_LINES.default;
    if (lineCount > limit) problem(`${name}: ${lineCount} lines exceeds budget of ${limit}`);
  }

  // 6. Orphans: every source file must be reachable from a declared build or
  // repository-only research root, or explicitly allowlisted. Includes in an
  // allowlisted/unreachable file do not confer reachability on their targets.
  for (const name of orphanedSourceFiles([...fileNames], manifestPaths, includesBySource)) {
    problem(`${name}: not reachable from the build manifest include graph`);
  }

  // 7. Repository docs: relative links must resolve (source/ links are
  // checked above; this covers README, INSTALL, docs/, and friends).
  for (const doc of ROOT_DOCS) {
    const file = path.join(repo, doc);
    let text;
    try { text = await readFile(file, 'utf8'); }
    catch { problem(`${doc}: expected repository doc is missing`); continue; }
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = m[1].trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      try { await stat(path.resolve(path.dirname(file), target.split('#')[0])); }
      catch { problem(`${doc}: broken relative link: ${target}`); }
    }
  }

  if (errors.length) {
    console.error(`FAIL (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`PASS (${files.length} source files validated)`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
