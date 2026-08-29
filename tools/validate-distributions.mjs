#!/usr/bin/env node
// Validates the committed distributions in dist/.
// 1. Rebuilds from source/ into a temp dir and requires byte-identical output
//    (catches hand-edited dist files and stale builds).
// 2. Enforces host contracts: skill frontmatter shape, Codex AGENTS.md byte
//    budget, no unresolved includes, no broken relative links.
// 3. Exercises install, idempotent reinstall, and staged update behavior.
// Run: node tools/validate-distributions.mjs

import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, build } from './build-distributions.mjs';
import { runInstallLifecycleTests } from './install-distribution.test.mjs';
import { analyzeRuntimeLoads, runtimeLoadErrors } from './validate-runtime-loads.mjs';
import { contextRouteReferenceErrors, generatedReferencePathErrors } from './validate-source.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(repo, 'dist');
const errors = [];
const problem = (m) => errors.push(m);

const CODEX_AGENTS_BYTE_LIMIT = 32768; // Codex project_doc_max_bytes default
const FORKED_REVIEW_SKILLS = new Set(MANIFEST.skills
  .filter((skill) => skill.claude?.context === 'fork' && skill.claude?.agent === 'code-reviewer')
  .map((skill) => skill.name));

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

function checkSkill(file, text, expectedName, protectedClaudeEntryPoints) {
  const rows = text.split('\n');
  if (rows[0] !== '---') { problem(`${file}: missing frontmatter`); return; }
  const end = rows.indexOf('---', 1);
  const fields = Object.fromEntries(rows.slice(1, end).map((r) => r.match(/^([a-z-]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
  if (fields.name !== expectedName) problem(`${file}: frontmatter name "${fields.name}" must match directory "${expectedName}"`);
  if (!/^[a-z0-9-]{1,64}$/.test(fields.name ?? '')) problem(`${file}: invalid skill name`);
  if (!fields.description) problem(`${file}: missing description`);
  else if (fields.description.length > 1024) problem(`${file}: description exceeds 1024 characters`);
  if (file.includes(`${path.sep}claude${path.sep}`) && FORKED_REVIEW_SKILLS.has(expectedName)) {
    if (fields['disable-model-invocation'] !== 'true' || fields.context !== 'fork' || fields.agent !== 'code-reviewer' || fields.background !== 'false') {
      problem(`${file}: review skill must be explicit-only and use the foreground code-reviewer fork`);
    }
    if (!text.includes('$ARGUMENTS')) problem(`${file}: forked review skill does not receive an explicit caller scope`);
  }
  if (file.includes(`${path.sep}claude${path.sep}`) && protectedClaudeEntryPoints.has(expectedName)) {
    problem(`${file}: project skill replaces protected Claude native entrypoint ${expectedName}`);
  }
}

async function checkHost(hostRoot, protectedClaudeEntryPoints = new Set()) {
  for (const file of await walk(hostRoot)) {
    if (!file.endsWith('.md')) continue;
    const rel = path.relative(repo, file);
    const text = await readFile(file, 'utf8');
    if (text.includes('{{include:')) problem(`${rel}: unresolved include directive`);
    if (path.basename(file) === 'SKILL.md') checkSkill(rel, text, path.basename(path.dirname(file)), protectedClaudeEntryPoints);
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

  const hostsDoc = JSON.parse(await readFile(path.join(repo, 'source/compatibility/hosts.json'), 'utf8'));
  const protectedClaudeEntryPoints = new Set(hostsDoc.supported_hosts?.claude?.protected_native_entrypoints ?? []);
  await checkHost(path.join(dist, 'claude'), protectedClaudeEntryPoints);
  await checkHost(path.join(dist, 'codex'));
  const referenceSources = new Set(MANIFEST.reference);
  const referenceBasenames = new Set(MANIFEST.reference.map((source) => path.posix.basename(source)));
  for (const context of MANIFEST.contexts) {
    const relative = `.claude/rules/${context.rule}`;
    const route = await readFile(path.join(dist, 'claude', relative), 'utf8');
    for (const error of generatedReferencePathErrors(route, referenceBasenames)) problem(`dist/claude/${relative}: ${error}`);
    for (const error of contextRouteReferenceErrors(route, context, referenceSources)) problem(`dist/claude/${relative}: ${error}`);
  }
  const reviewer = await readFile(path.join(dist, 'claude/.claude/agents/code-reviewer.md'), 'utf8');
  if (!/^tools: Read, Grep, Glob$/m.test(reviewer)) problem('dist/claude/.claude/agents/code-reviewer.md: read-only tool allowlist changed');
  const runtimeReport = await analyzeRuntimeLoads(dist);
  for (const error of runtimeLoadErrors(runtimeReport)) problem(`runtime load: ${error}`);
  await runInstallLifecycleTests({ distributionRoot: dist });

  if (errors.length) {
    console.error(`FAIL (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`PASS (distributions match a fresh build, satisfy host contracts, validate ${runtimeReport.plans.length} load plans, and pass install lifecycle tests)`);
}

main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
