#!/usr/bin/env node
// Generates the Claude Code and Codex distributions in dist/ from source/.
// Dependency-free and deterministic: same source in, byte-identical dist out.
// Source-to-host mappings live in manifest.mjs, which is also read by the
// installer for the separately packaged runtime payload.

import { lstat, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MANIFEST, contextManifestErrors, contextRuleSourcePathErrors, destinationBasename, runtimeDestination,
} from './manifest.mjs';
import { loadThresholds, requiredThreshold } from './lib/thresholds.mjs';

export { MANIFEST, contextManifestErrors, contextRuleSourcePathErrors } from './manifest.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repo, 'source');
const thresholds = await loadThresholds();
const COMPACT_OBLIGATION_MAX_BYTES = requiredThreshold(thresholds, 'COMPACT_OBLIGATION_MAX_BYTES');
const THIN_CONTEXT_ROUTE_MAX_BYTES = requiredThreshold(thresholds, 'THIN_CONTEXT_ROUTE_MAX_BYTES');
const THIN_CONTEXT_ROUTE_MAX_PHYSICAL_LINES = requiredThreshold(thresholds, 'THIN_CONTEXT_ROUTE_MAX_PHYSICAL_LINES');
// Text rewrites applied everywhere: source-relative utility paths become
// dist-relative paths that exist in the installed layout.
const REWRITES = [
  ['tools/contrast-check.mjs', 'agent-rules/tools/contrast-check.mjs'],
  ['tools/slop-scan.mjs', 'agent-rules/tools/slop-scan.mjs'],
  ['tools/file-size-guard.mjs', 'agent-rules/tools/file-size-guard.mjs'],
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

const manifestLists = ['core', 'skills', 'contexts', 'reference', 'profiles', 'config', 'research', 'tools', 'agents'];
const windowsDevice = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\..*)?$/i;
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
    list('config').forEach((source, index) => claim(host, `agent-rules/tools/config/${destinationBasename(source)}`, `config[${index}] ${source}`));
    list('tools').forEach((source, index) => claim(host, runtimeDestination(source), `tools[${index}] ${source}`));
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
  list('config').forEach((relative, index) => claim('source', relative, `config[${index}]`));
  list('research').forEach((relative, index) => claim('source', relative, `research[${index}]`));
  list('tools').forEach((relative, index) => claim('repository', relative, `tools[${index}]`));
  list('skills').forEach((skill, index) => claim('source', `skills/${skill?.name}.md`, `skills[${index}] derived source`, true));
  list('contexts').forEach((context, index) => {
    claim('source', context?.source, `contexts[${index}].source`, true);
    claim('source', context?.ruleSource, `contexts[${index}].ruleSource`, true);
    if (context?.obligationSource !== undefined) claim('source', context.obligationSource, `contexts[${index}].obligationSource`, true);
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
  for (const [index, source] of (Array.isArray(manifest?.tools) ? manifest.tools : []).entries()) {
    if (typeof source === 'string' && !source.startsWith('tools/')) {
      errors.push(`tools[${index}] path ${JSON.stringify(source)} must stay under tools/`);
    }
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

const occurrences = (text, token) => token ? text.split(token).length - 1 : 0;

export function compiledObligationErrors(root, obligations) {
  return obligations.filter(({ body }) => !body || occurrences(root, body) !== 1)
    .map(({ name }) => `fully composed Codex root must contain the canonical ${name} obligation exactly once`);
}

export function compactContextObligationErrors(text) {
  const errors = [];
  const body = stripFrontmatter(text).trim();
  const ids = body.match(/\bUI-\d{2}\b/g) ?? [];
  if (!body || body.split(/\r?\n/).length !== 1) errors.push('compact obligation body must contain exactly one physical-line paragraph');
  if (/^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s|>|```|~~~)/m.test(body)) errors.push('compact obligation must be a paragraph without headings, lists, quotes, or fences');
  if (/\{\{(?:include|core)\b/i.test(body)) errors.push('compact obligation must not contain nested includes or core expansion');
  if (/agent-rules\/reference\//.test(body)) errors.push('compact obligation must not name installed full-reference paths');
  if (/\bAE-\d{2}\b/.test(body)) errors.push('compact obligation must not duplicate kernel AE directive IDs');
  if (ids.length !== 1 || ids[0] !== 'UI-01') errors.push('compact obligation must declare stable directive UI-01 exactly once');
  if (!/\bMUST\b/.test(body)) errors.push('compact obligation UI-01 must have normative MUST strength');
  if (Buffer.byteLength(body, 'utf8') > COMPACT_OBLIGATION_MAX_BYTES) errors.push(`compact obligation body exceeds ${COMPACT_OBLIGATION_MAX_BYTES} bytes`);
  return errors;
}

export function thinContextRouteErrors(text, { obligationSource, obligationText } = {}) {
  const errors = [];
  const body = stripFrontmatter(text).trim();
  const bodyLines = body.split(/\r?\n/).filter((line) => line.trim());
  const declaredInclude = obligationSource ? `{{include:${obligationSource}}}` : null;
  const obligationBody = typeof obligationText === 'string' ? stripFrontmatter(obligationText).trim() : '';
  const expanded = declaredInclude && typeof obligationText === 'string'
    ? text.replace(declaredInclude, obligationBody)
    : text;
  const bytes = Buffer.byteLength(expanded, 'utf8');
  const lines = expanded.split(/\r?\n/).length;
  const routingParagraph = bodyLines[obligationSource ? 2 : 1] ?? '';
  if (bytes > THIN_CONTEXT_ROUTE_MAX_BYTES) errors.push(`thin route is ${bytes} bytes; maximum is ${THIN_CONTEXT_ROUTE_MAX_BYTES}`);
  if (lines > THIN_CONTEXT_ROUTE_MAX_PHYSICAL_LINES) errors.push(`thin route is ${lines} lines; maximum is ${THIN_CONTEXT_ROUTE_MAX_PHYSICAL_LINES}`);
  if (bodyLines.length !== (obligationSource ? 3 : 2) || !/^# [^#]/.test(bodyLines[0]) || /^\s*(?:[-*+]|\d+\.)\s/.test(routingParagraph)) {
    errors.push(`thin route body must contain one level-one heading, ${obligationSource ? 'one declared compact obligation include, and ' : ''}one routing paragraph`);
  }
  if (obligationSource && (occurrences(text, declaredInclude) !== 1 || bodyLines[1] !== declaredInclude)) {
    errors.push(`thin route must contain exactly one standalone declared include ${declaredInclude}`);
  }
  if (obligationSource && obligationBody && occurrences(expanded, obligationBody) !== 1) errors.push('thin route must compile the canonical compact obligation exactly once');
  const includeTokens = [...text.matchAll(/\{\{(?:include:([^}]+)|core)\}\}/g)].map((match) => match[0]);
  if (includeTokens.some((token) => token !== declaredInclude) || (!obligationSource && includeTokens.length)) {
    errors.push('thin route must not contain arbitrary includes or core expansion');
  }
  if (!/\bconsult\s+`[^`\r\n]+\.md`/i.test(routingParagraph)) {
    errors.push('thin route paragraph must name its full reference as optional detail with "consult"');
  }
  if (!/\buncertainty\s+beyond\s+(?:the\s+)?kernel\/repository contracts?\b/i.test(routingParagraph)) {
    errors.push('thin route paragraph must limit consultation to uncertainty beyond kernel/repository contracts');
  }
  if (/\bAE-\d{2}\b/i.test(text)) errors.push('thin route must not duplicate kernel rule authorities');
  return errors;
}

export async function contextRuleSourceErrors(manifest = MANIFEST, sourceDirectory = src) {
  const errors = contextRuleSourcePathErrors(manifest);
  const unsafeIndexes = new Set(errors.map((error) => Number(error.match(/^contexts\[(\d+)\]/)?.[1])).filter(Number.isInteger));
  let sourceReal;
  try { sourceReal = await realpath(sourceDirectory); }
  catch { sourceReal = path.resolve(sourceDirectory); }
  const validationRoot = { absolute: path.resolve(sourceDirectory), real: sourceReal, label: 'source' };
  const obligationTexts = new Map();
  for (const [index, context] of (manifest.contexts ?? []).entries()) {
    if (unsafeIndexes.has(index)) continue;
    let obligationText;
    if (context.obligationSource) {
      try {
        obligationText = (await checkedSourceFile(validationRoot, context.obligationSource, `contexts[${index}].obligationSource`)).toString('utf8');
        obligationTexts.set(index, obligationText);
        for (const error of compactContextObligationErrors(obligationText)) errors.push(`contexts[${index}] obligationSource "${context.obligationSource}" ${error}`);
      } catch (error) {
        errors.push(`contexts[${index}] obligationSource "${context.obligationSource}" ${error.message}`);
      }
    }
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
        for (const error of thinContextRouteErrors(route, { obligationSource: context.obligationSource, obligationText })) errors.push(`contexts[${index}] ruleSource "${context.ruleSource}" ${error}`);
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

  let codexRoot;
  if ((manifest.contexts ?? []).some((context) => context.obligationSource)) {
    try { codexRoot = (await checkedSourceFile(validationRoot, 'templates/codex-root.md', 'Codex root')).toString('utf8'); }
    catch (error) { errors.push(`Codex root ${error.message}`); }
  }
  if (codexRoot !== undefined) {
    const allowedRootIncludes = new Set([
      '{{core}}',
      `{{include:profiles/${manifest.defaultProfile}.md}}`,
      ...(manifest.contexts ?? []).filter((context) => context.obligationSource).map((context) => `{{include:${context.obligationSource}}}`),
    ]);
    const rootIncludes = [...codexRoot.matchAll(/\{\{(?:include:[^}]+|core)\}\}/g)].map((match) => match[0]);
    for (const include of rootIncludes) if (!allowedRootIncludes.has(include)) errors.push(`Codex root contains undeclared composed source ${include}`);
    for (const include of allowedRootIncludes) if (occurrences(codexRoot, include) !== 1) errors.push(`Codex root must contain declared composed source ${include} exactly once`);
  }
  for (const [index, context] of (manifest.contexts ?? []).entries()) {
    if (!context.obligationSource) continue;
    const include = `{{include:${context.obligationSource}}}`;
    const obligationBody = obligationTexts.has(index) ? stripFrontmatter(obligationTexts.get(index)).trim() : '';
    try {
      const fullReference = (await checkedSourceFile(validationRoot, context.source, `contexts[${index}].source`)).toString('utf8');
      if (occurrences(fullReference, include) !== 1) errors.push(`contexts[${index}] source "${context.source}" must include ${include} exactly once`);
      const referenceIncludes = [...fullReference.matchAll(/\{\{(?:include:[^}]+|core)\}\}/g)].map((match) => match[0]);
      if (referenceIncludes.length !== 1 || referenceIncludes[0] !== include) errors.push(`contexts[${index}] source "${context.source}" must contain only its declared compact obligation include`);
      const expandedReference = fullReference.replace(include, obligationBody);
      if (obligationBody && occurrences(expandedReference, obligationBody) !== 1) errors.push(`contexts[${index}] source "${context.source}" must compile the canonical compact obligation exactly once`);
    } catch (error) {
      errors.push(`contexts[${index}] source "${context.source}" ${error.message}`);
    }
    if (codexRoot === undefined) continue;
    const primaryReference = `agent-rules/reference/${destinationBasename(context.source)}`;
    if (occurrences(codexRoot, include) !== 1) errors.push(`Codex root must include ${include} exactly once`);
    if (occurrences(codexRoot, primaryReference) !== 1) errors.push(`Codex root must name ${primaryReference} exactly once`);
    const expandedCodexRoot = codexRoot.replace(include, obligationBody);
    if (obligationBody && occurrences(expandedCodexRoot, obligationBody) !== 1) errors.push(`Codex root must compile the canonical compact obligation for ${context.name} exactly once`);
    const deliveryRows = expandedCodexRoot.split(/\r?\n/).filter((row) => row.includes(obligationBody) || row.includes(primaryReference));
    if (deliveryRows.length !== 1 || !deliveryRows[0].includes(obligationBody) || !deliveryRows[0].includes(primaryReference)) {
      errors.push(`Codex root must keep ${include} and ${primaryReference} together on exactly one physical row`);
    } else {
      for (const other of (manifest.contexts ?? []).filter((candidate) => candidate !== context)) {
        const otherReference = `agent-rules/reference/${destinationBasename(other.source)}`;
        if (deliveryRows[0].includes(otherReference)) errors.push(`Codex root obligation row for ${context.name} must not name other context reference ${otherReference}`);
      }
    }
    if (!obligationTexts.has(index)) errors.push(`contexts[${index}] obligationSource "${context.obligationSource}" cannot be validated for shared delivery`);
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
  const codexRootBody = await composed('templates/codex-root.md', new Set());
  const obligations = await Promise.all(MANIFEST.contexts.filter((context) => context.obligationSource)
    .map(async (context) => ({ name: context.name, body: stripFrontmatter(await read(context.obligationSource)).trim() })));
  const compositionErrors = compiledObligationErrors(codexRootBody, obligations);
  if (compositionErrors.length) throw new Error(compositionErrors.join('\n'));
  outRoot = await assertSafeOutputRoots(outRoot);
  const claude = path.join(outRoot, 'claude'), codex = path.join(outRoot, 'codex');
  await rm(claude, { recursive: true, force: true });
  await rm(codex, { recursive: true, force: true });

  const refBasenames = new Set(MANIFEST.reference.map(destinationBasename));

  // Shared generated payload. Runtime tools are package-root sources installed
  // directly by install-distribution.mjs and never duplicated in dist/.
  for (const host of [claude, codex]) {
    for (const rel of MANIFEST.reference) {
      await emit(host, `agent-rules/reference/${destinationBasename(rel)}`, await composedReference(rel, refBasenames));
    }
    for (const rel of MANIFEST.profiles) {
      await emit(host, `agent-rules/profiles/${destinationBasename(rel)}`, await composed(rel, new Set()));
    }
    for (const rel of MANIFEST.config) {
      await emit(host, `agent-rules/tools/config/${destinationBasename(rel)}`, await read(rel));
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
  await emit(codex, 'AGENTS.md', codexRootBody);
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
