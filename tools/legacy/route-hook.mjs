#!/usr/bin/env node
// DEPRECATED (2.0.0): this 1.x injection hook is no longer part of any
// install path. Native .claude/rules and .claude/skills replace it; see
// docs/migration-notes.md. Kept one transition cycle for old setups. It
// also references the 1.x router layout (AGENTS.md task table), which no
// longer exists in this repository, so it only works inside a 1.x copy.
//
// Mechanical route delivery for Claude Code (UserPromptSubmit hook).
// Some agents skip routed files even with the router fully in context,
// especially on small well-specified tasks. This hook removes that
// discretion by injecting routed rule file contents directly into context.
// Wire four hook entries (chunk args 1..4); each stays under the 10k-char
// context cap. See tools/README.md. Keyword routing is deliberately coarse:
// wrong matches fall through to the Feature bundle, a superset of Change.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CORPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHUNK_LIMIT = 9000;
const MAX_CHUNKS = 4;
const ALWAYS = ['core/priorities.md', 'core/evidence-first.md', 'core/communication.md'];
const CODE = ['core/conventions.md', 'core/anti-slop.md'];
const CHANGE = ['workflow/implementation.md', 'workflow/verification.md', 'workflow/skeptic-pass.md'];
const DESIGN = ['workflow/design-checkpoint.md', 'design/principles.md'];
const CONCERNS = [
  'design/boundaries.md',
  'design/types-and-state.md',
  'design/errors-and-side-effects.md',
  'quality/testing.md',
];
const FEATURE = [...CODE, ...CHANGE, ...DESIGN, ...CONCERNS];
const CONTEXT_HINTS = [
  [/website|web ?app|frontend|browser|\bpage\b|\bui\b/, ['contexts/web-ui.md']],
  [/typescript|react|\.tsx?\b|\bjsx\b/, ['contexts/typescript-react.md']],
];
const ROUTES = [
  [/review (this|the|my)|code review|pull request|\bpr\b/, [...CODE, 'contexts/pr-review.md', 'workflow/review-ledger.md', 'workflow/skeptic-pass.md']],
  [/migrat|database change|\bschema\b/, [...CODE, 'contexts/database-migrations.md', 'workflow/verification.md', 'workflow/skeptic-pass.md', 'quality/security.md']],
  [/security (audit|review)|\baudit\b/, ['quality/security.md', 'workflow/skeptic-pass.md', 'contexts/pr-review.md']],
  [/\b(fix|bug|broken|crash|regress|fail|error|charged twice|duplicate)/, [...CODE, ...CHANGE, 'workflow/design-checkpoint.md', 'design/errors-and-side-effects.md', 'quality/testing.md']],
  [/\b(refactor|restructure|rename)\b/, FEATURE],
];

function hostDeclared() {
  const out = [];
  try {
    const text = readFileSync('AGENTS.md', 'utf8');
    for (const label of ['Active profile:', 'Active canonical contexts:']) {
      const line = text.split('\n').find((row) => row.includes(label)) ?? '';
      for (const match of line.matchAll(/`[^`]*?((?:profiles|contexts)\/[A-Za-z0-9_-]+\.md)`/g)) {
        out.push(match[1]);
      }
    }
  } catch {
    // No host AGENTS.md: inject the standard profile as the router default.
    out.push('profiles/standard.md');
  }
  return out;
}

function main() {
  const chunkIndex = Number(process.argv[2] ?? '1');
  let prompt = '';
  try {
    prompt = String(JSON.parse(readFileSync(0, 'utf8')).prompt ?? '');
  } catch {
    // Unreadable stdin: fall through with an empty prompt (Feature bundle).
  }
  const lowered = prompt.toLowerCase();
  let route = FEATURE;
  for (const [pattern, files] of ROUTES) {
    if (pattern.test(lowered)) {
      route = files;
      break;
    }
  }
  const hinted = CONTEXT_HINTS.flatMap(([pattern, list]) => (pattern.test(lowered) ? list : []));
  const files = [...new Set([...ALWAYS, ...route, ...hinted, ...hostDeclared()])];
  const sections = [];
  for (const file of files) {
    try {
      sections.push(`\n===== agent-rules/${file}\n${readFileSync(path.join(CORPUS, file), 'utf8')}`);
    } catch {
      process.stderr.write(`route-hook: missing ${file}\n`);
    }
  }
  const bins = ['Engineering rules routed mechanically for this task by agent-rules. Follow them; they are already fully included below, so do not re-read these files.\n'];
  for (const section of sections) {
    if (bins[bins.length - 1].length + section.length > CHUNK_LIMIT) {
      bins.push('(engineering rules, continued)\n');
    }
    bins[bins.length - 1] += section;
  }
  if (bins.length > MAX_CHUNKS) {
    process.stderr.write(`route-hook: bundle needs ${bins.length} chunks; only ${MAX_CHUNKS} wired\n`);
  }
  process.stdout.write(bins[chunkIndex - 1] ?? '');
}

main();
