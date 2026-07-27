#!/usr/bin/env node
// Deterministic validation of the canonical corpus in source/.
// Checks frontmatter, include targets, relative links, budgets, and that the
// build manifest covers every source file. Run: node tools/validate-source.mjs

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST } from './build-distributions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(repo, 'source');
const errors = [];
const problem = (m) => errors.push(m);
const rel = (f) => path.relative(src, f);

// Files allowed to exist without appearing in the manifest or any include.
const ORPHAN_ALLOWLIST = new Set(['contexts/_template.md']);
const MAX_LINES = { default: 100, skills: 60, templates: 80 };
// Internal source metadata schema for rule files (not emitted to dist).
const SCOPES = new Set(['always', 'any-code-change', 'routed', 'context', 'profile', 'template']);
// Repository docs outside source/ whose relative links must also resolve.
const ROOT_DOCS = ['README.md', 'INSTALL.md', 'ADOPT.md', 'CHANGELOG.md', 'AGENTS.md', 'CLAUDE.md', 'tools/README.md', 'docs/capability-matrix.md', 'docs/migration-notes.md'];

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, files);
    else if (entry.name.endsWith('.md')) files.push(file);
  }
  return files;
}

function frontmatter(text, name) {
  const rows = text.split('\n'), fields = new Map();
  if (rows[0] !== '---') return null;
  const end = rows.indexOf('---', 1);
  if (end < 0) { problem(`${name}: unclosed frontmatter`); return fields; }
  for (const row of rows.slice(1, end)) {
    const m = row.match(/^([a-z_-]+):\s*(.*)$/);
    if (m) fields.set(m[1], m[2].trim());
    else if (!/^\s*-\s/.test(row) && row.trim()) problem(`${name}: invalid frontmatter line: ${row}`);
  }
  return fields;
}

async function main() {
  const files = (await walk(src)).sort();
  const used = new Set();

  // 1. Manifest closure: every manifest path must exist.
  const manifestPaths = [
    ...MANIFEST.core, ...MANIFEST.reference, ...MANIFEST.profiles,
    ...MANIFEST.contexts.map((c) => c.source),
    ...MANIFEST.skills.map((s) => `skills/${s.name}.md`),
    ...MANIFEST.agents.map((a) => a.template),
    'templates/claude-root.md', 'templates/codex-root.md',
  ];
  for (const p of manifestPaths) {
    used.add(p);
    try { await stat(path.join(src, p)); }
    catch { problem(`manifest references missing source file: ${p}`); }
  }
  for (const p of MANIFEST.tools) {
    try { await stat(path.join(repo, p)); }
    catch { problem(`manifest references missing tool: ${p}`); }
  }

  for (const file of files) {
    const name = rel(file);
    const text = await readFile(file, 'utf8');
    if (!text.trim()) { problem(`${name}: empty file`); continue; }

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
      const expected = path.basename(name, '.md');
      if (fields.get('name') !== expected) problem(`${name}: frontmatter name must be "${expected}"`);
      const description = fields.get('description') ?? '';
      if (!description) problem(`${name}: missing description`);
      if (description.length > 1024) problem(`${name}: description exceeds 1024 characters`);
      if (!/^[a-z0-9-]{1,64}$/.test(expected)) problem(`${name}: skill name must be lowercase alphanumeric/hyphen, max 64 chars`);
    }

    // 3. Include targets exist; record usage.
    for (const m of text.matchAll(/\{\{include:([^}]+)\}\}/g)) {
      const target = m[1].trim();
      used.add(target);
      try { await stat(path.join(src, target)); }
      catch { problem(`${name}: include target missing: ${target}`); }
    }

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

  // 6. Orphans: every source file must be shipped or allowlisted.
  for (const file of files) {
    const name = rel(file);
    if (!used.has(name) && !ORPHAN_ALLOWLIST.has(name)) problem(`${name}: not referenced by the build manifest or any include`);
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

main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
