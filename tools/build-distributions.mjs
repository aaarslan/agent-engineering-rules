#!/usr/bin/env node
// Generates the Claude Code and Codex distributions in dist/ from source/.
// Dependency-free and deterministic: same source in, byte-identical dist out.
// The MANIFEST below is the single mapping authority from source files to
// host-native locations. Edit source/, edit MANIFEST if the mapping changes,
// then run: node tools/build-distributions.mjs [outputRoot]

import { mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = {
  // Always-active policy, in order. Claude: one rule file each (always loaded).
  // Codex: concatenated into the generated AGENTS.md via the root template.
  core: [
    'core/priorities.md',
    'core/evidence-first.md',
    'core/communication.md',
    'core/conventions.md',
    'core/anti-slop.md',
  ],
  // Task skills. Frames live in source/skills/<name>.md (frontmatter: name,
  // description). `claude` holds Claude-only frontmatter extras.
  skills: [
    { name: 'feature-implementation', claude: {} },
    { name: 'bug-fix', claude: {} },
    { name: 'refactor', claude: {} },
    // Review-only skills lose edit tools for the invoking turn: the skill
    // contract says report, not fix, and the restriction clears on the next
    // user message, so "now fix it" still works as a follow-up.
    { name: 'pr-review', claude: { disallowedTools: 'Edit, Write, NotebookEdit' } },
    { name: 'database-change', claude: { paths: ['**/migrations/**', 'db/**', 'prisma/**', '**/*.sql'] } },
    { name: 'security-audit', claude: { disallowedTools: 'Edit, Write, NotebookEdit' } },
    { name: 'autonomous-mission', claude: { disableModelInvocation: true } },
    { name: 'doc-update', claude: {} },
    { name: 'ui-styling', claude: {} },
  ],
  // Stack contexts. Claude: path-scoped rules (adjust globs to the host repo).
  // Codex: shipped under agent-rules/reference/ and pointed to from AGENTS.md.
  contexts: [
    { source: 'contexts/web-ui.md', rule: 'context-web-ui.md', paths: ['**/*.tsx', '**/*.jsx', '**/*.html', '**/*.css', '**/*.vue', '**/*.svelte'] },
    { source: 'contexts/typescript-react.md', rule: 'context-typescript-react.md', paths: ['**/*.ts', '**/*.tsx', '**/*.jsx'] },
    { source: 'contexts/backend-api.md', rule: 'context-backend-api.md', paths: ['**/api/**', '**/server/**', '**/routes/**', '**/controllers/**', '**/handlers/**', '**/services/**'] },
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
    'agents/orchestration.md',
  ],
  profiles: ['profiles/prototype.md', 'profiles/standard.md', 'profiles/regulated.md'],
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
  const rows = text.split('\n');
  if (rows[0] !== '---') return text.trim() + '\n';
  const end = rows.indexOf('---', 1);
  if (end < 0) return text.trim() + '\n';
  return rows.slice(end + 1).join('\n').trim() + '\n';
}

export function frontmatterFields(text) {
  const rows = text.split('\n'), fields = {};
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

const rewrite = (text) => REWRITES.reduce((t, [from, to]) => t.split(from).join(to), text);

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
  return rewrite(relink(await resolveIncludes(body), siblings)).trim() + '\n';
}

function skillFrontmatter(name, description, extras = {}) {
  const lines = ['---', `name: ${name}`, `description: ${description}`];
  if (extras.allowedTools) lines.push(`allowed-tools: ${extras.allowedTools}`);
  if (extras.disallowedTools) lines.push(`disallowed-tools: ${extras.disallowedTools}`);
  if (extras.disableModelInvocation) lines.push('disable-model-invocation: true');
  if (extras.paths) { lines.push('paths:'); for (const p of extras.paths) lines.push(`  - "${p}"`); }
  lines.push('---', '');
  return lines.join('\n');
}

async function emit(root, rel, content) {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, 'utf8');
}

export async function build(outRoot = path.join(repo, 'dist')) {
  const claude = path.join(outRoot, 'claude'), codex = path.join(outRoot, 'codex');
  await rm(claude, { recursive: true, force: true });
  await rm(codex, { recursive: true, force: true });

  const refBasenames = new Set(MANIFEST.reference.map((f) => path.basename(f)));
  const codexRefBasenames = new Set([...refBasenames, ...MANIFEST.contexts.map((c) => path.basename(c.source))]);

  // Shared payload: reference, profiles, tools under agent-rules/.
  for (const host of [claude, codex]) {
    const siblings = host === codex ? codexRefBasenames : refBasenames;
    for (const rel of MANIFEST.reference) {
      await emit(host, `agent-rules/reference/${path.basename(rel)}`, await composedReference(rel, siblings));
    }
    for (const rel of MANIFEST.profiles) {
      await emit(host, `agent-rules/profiles/${path.basename(rel)}`, await composed(rel, new Set()));
    }
    for (const rel of MANIFEST.tools) {
      const dest = path.join(host, 'agent-rules/tools', path.basename(rel));
      await mkdir(path.dirname(dest), { recursive: true });
      await copyFile(path.join(repo, rel), dest);
    }
  }
  // Codex-only reference copies of the stack contexts.
  for (const ctx of MANIFEST.contexts) {
    await emit(codex, `agent-rules/reference/${path.basename(ctx.source)}`, await composedReference(ctx.source, codexRefBasenames));
  }

  // Skills for both hosts from one frame.
  for (const skill of MANIFEST.skills) {
    const raw = await read(`skills/${skill.name}.md`);
    const meta = frontmatterFields(raw);
    if (meta.name !== skill.name || !meta.description) throw new Error(`skills/${skill.name}.md: frontmatter must define matching name and a description`);
    const body = rewrite(relink(await resolveIncludes(stripFrontmatter(raw)))).trim() + '\n';
    await emit(claude, `.claude/skills/${skill.name}/SKILL.md`, skillFrontmatter(skill.name, meta.description, skill.claude) + '\n' + body);
    await emit(codex, `.agents/skills/${skill.name}/SKILL.md`, skillFrontmatter(skill.name, meta.description) + '\n' + body);
  }

  // Claude always-on rules (core), path-scoped rules (contexts), active profile.
  for (const rel of MANIFEST.core) {
    await emit(claude, `.claude/rules/core-${path.basename(rel)}`, await composed(rel, new Set()));
  }
  for (const ctx of MANIFEST.contexts) {
    const fm = ['---', 'paths:', ...ctx.paths.map((p) => `  - "${p}"`), '---', '', ''].join('\n');
    await emit(claude, `.claude/rules/${ctx.rule}`, fm + await composed(ctx.source, new Set()));
  }
  const profileNote = '<!-- Active profile: standard. To switch, replace the body below with agent-rules/profiles/prototype.md or agent-rules/profiles/regulated.md. -->\n\n';
  await emit(claude, '.claude/rules/profile.md', profileNote + await composed('profiles/standard.md', new Set()));

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
  return rewrite(relink(await resolveIncludes(body), siblings)).trim() + '\n';
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(repo, 'dist');
  build(out).then(
    () => console.log(`BUILT ${path.relative(repo, out) || out}`),
    (error) => { console.error(`BUILD FAILED: ${error.message}`); process.exit(1); },
  );
}
