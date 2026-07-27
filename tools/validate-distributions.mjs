#!/usr/bin/env node
// Validates the committed distributions in dist/.
// 1. Rebuilds from source/ into a temp dir and requires byte-identical output
//    (catches hand-edited dist files and stale builds).
// 2. Enforces host contracts: skill frontmatter shape, Codex AGENTS.md byte
//    budget, no unresolved includes, no broken relative links.
// Run: node tools/validate-distributions.mjs

import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-distributions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'dist');
const errors = [];
const problem = (m) => errors.push(m);

const CODEX_AGENTS_BYTE_LIMIT = 32768; // Codex project_doc_max_bytes default

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file, files);
    else files.push(file);
  }
  return files;
}

async function compareTrees(expectedRoot, actualRoot) {
  const expected = (await walk(expectedRoot)).map((f) => path.relative(expectedRoot, f)).sort();
  const actual = (await walk(actualRoot)).map((f) => path.relative(actualRoot, f)).sort();
  for (const f of expected) if (!actual.includes(f)) problem(`dist is missing generated file: ${f}`);
  for (const f of actual) if (!expected.includes(f)) problem(`dist contains file the build does not produce: ${f}`);
  for (const f of expected) {
    if (!actual.includes(f)) continue;
    const [a, b] = await Promise.all([readFile(path.join(expectedRoot, f)), readFile(path.join(actualRoot, f))]);
    if (!a.equals(b)) problem(`dist/${f} differs from a fresh build; run: node tools/build-distributions.mjs`);
  }
}

function checkSkill(file, text, expectedName) {
  const rows = text.split('\n');
  if (rows[0] !== '---') { problem(`${file}: missing frontmatter`); return; }
  const end = rows.indexOf('---', 1);
  const fields = Object.fromEntries(rows.slice(1, end).map((r) => r.match(/^([a-z-]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  if (fields.name !== expectedName) problem(`${file}: frontmatter name "${fields.name}" must match directory "${expectedName}"`);
  if (!/^[a-z0-9-]{1,64}$/.test(fields.name ?? '')) problem(`${file}: invalid skill name`);
  if (!fields.description) problem(`${file}: missing description`);
  else if (fields.description.length > 1024) problem(`${file}: description exceeds 1024 characters`);
}

async function checkHost(hostRoot) {
  for (const file of await walk(hostRoot)) {
    if (!file.endsWith('.md')) continue;
    const rel = path.relative(repo, file);
    const text = await readFile(file, 'utf8');
    if (text.includes('{{include:')) problem(`${rel}: unresolved include directive`);
    if (path.basename(file) === 'SKILL.md') checkSkill(rel, text, path.basename(path.dirname(file)));
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = m[1].trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
      const dest = path.resolve(path.dirname(file), target.split('#')[0]);
      if (!dest.startsWith(hostRoot)) { problem(`${rel}: relative link escapes the distribution: ${target}`); continue; }
      try { await stat(dest); } catch { problem(`${rel}: broken relative link: ${target}`); }
    }
  }
}

async function main() {
  const temp = await mkdtemp(path.join(tmpdir(), 'aer-dist-'));
  try {
    await build(temp);
    await compareTrees(temp, dist);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }

  const agents = await readFile(path.join(dist, 'codex/AGENTS.md'));
  if (agents.byteLength > CODEX_AGENTS_BYTE_LIMIT) problem(`dist/codex/AGENTS.md is ${agents.byteLength} bytes; exceeds Codex default budget of ${CODEX_AGENTS_BYTE_LIMIT}`);

  await checkHost(path.join(dist, 'claude'));
  await checkHost(path.join(dist, 'codex'));

  if (errors.length) {
    console.error(`FAIL (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('PASS (distributions match a fresh build and satisfy host contracts)');
}

main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
