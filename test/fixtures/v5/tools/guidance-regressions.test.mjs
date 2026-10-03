import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from './build-distributions.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = (relative) => readFile(path.join(repo, 'source', relative), 'utf8');

test('kernel keeps stable directives, normative strength, priority, and completion', async () => {
  const kernel = await source('kernel/contract.md');
  const directiveLines = [...kernel.matchAll(/^- \*\*(AE-\d{2})\b([^\n]*)/gm)];
  const ids = directiveLines.map((match) => match[1]);
  assert.deepEqual([...ids].sort(), Array.from({ length: 26 }, (_, index) => `AE-${String(index + 1).padStart(2, '0')}`));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids.slice(0, 4), ['AE-15', 'AE-16', 'AE-20', 'AE-22']);
  for (const match of directiveLines) assert.match(match[2], /\b(?:MUST(?: NOT)?|SHOULD)\b/, `${match[1]} lacks normative strength`);
  assert.match(kernel, /Target: complete AND simple/);
  assert.match(kernel, /Order: scope\/owner → design → implement → falsify → final inspection → report/);
  assert.match(kernel, /AE-26 Completion.*claim done only with working behavior/);
});

test('design guidance permits coherent replacement without speculative structure', async () => {
  const [kernel, principles, boundaries] = await Promise.all([
    source('kernel/contract.md'), source('design/principles.md'), source('design/boundaries.md'),
  ]);
  assert.match(kernel, /AE-04 Coherence.*evidence may justify subsystem replacement, never unrelated redesign/);
  assert.match(kernel, /Diff size is neutral/);
  assert.match(principles, /Compare patch, refactor, and replacement against real behavior/);
  assert.match(principles, /neither preserving a broken abstraction nor speculative rebuilding earns credit/);
  assert.match(boundaries, /Otherwise call them directly; a pass-through wrapper is noise/);
});

test('testing guidance separates present evidence from durable regression investment', async () => {
  const [testing, prototype, standard, verification] = await Promise.all([
    source('quality/testing.md'), source('profiles/prototype.md'), source('profiles/standard.md'), source('workflow/verification.md'),
  ]);
  assert.match(testing, /Verification establishes current behavior\. Permanent tests protect stable behavior/);
  assert.match(testing, /complete working path first/);
  assert.match(testing, /Do not construct test architecture around substantially changing behavior/);
  assert.match(testing, /Do not rerun an unchanged broad suite after every edit/);
  assert.match(testing, /Optimize information gained per time, context, execution cost, and complexity/);
  assert.match(prototype, /Add permanent tests only on request, for material .* risk, or when they accelerate development/);
  assert.match(standard, /run relevant established regressions/);
  assert.match(verification, /An unchanged relevant pass remains evidence/);
  assert.match(verification, /No fixed report layout is required/);
});

test('verification protects real behavior and keeps diagnostics optional', async () => {
  const [kernel, verification, skill] = await Promise.all([
    source('kernel/contract.md'), source('workflow/verification.md'), source('skills/aer-verify.md'),
  ]);
  assert.match(kernel, /AE-20 Status.*MUST NOT pass failed, skipped, crashed, timed-out, flaky, empty, unavailable, unresolved checks/);
  assert.match(kernel, /AE-19 Doubles.*MUST NOT treat doubles as proof of production wiring, serialization, persistence, credentials, live integration/);
  assert.match(verification, /Optional diagnostics use `aer verify`/);
  assert.match(verification, /There is no automatic scan or help-discovery gate/);
  assert.match(skill, /when explicitly requested; not a routine final step/);
  assert.match(skill, /do not repeat valid evidence simply because another agent produced it/);
  assert.doesNotMatch(`${verification}\n${skill}`, /required report block|exactly three concise outcome lines|matching verification contract/i);
});

test('stack routes load only implicated full references', async () => {
  const [claudeRoot, codexRoot, webRoute, reactRoute, apiRoute] = await Promise.all([
    source('templates/claude-root.md'), source('templates/codex-root.md'),
    source('contexts/claude-web-ui.md'), source('contexts/claude-typescript-react.md'), source('contexts/claude-backend-api.md'),
  ]);
  assert.match(claudeRoot, /Consult full references only when they resolve uncertainty beyond the kernel\/repository contract/);
  assert.match(codexRoot, /Detail only for uncertainty/);
  assert.doesNotMatch(`${claudeRoot}\n${codexRoot}`, /always read.*reference\/verification|matching verification contract/i);
  assert.match(webRoute, /For uncertainty beyond kernel\/repository contracts, consult `agent-rules\/reference\/web-ui\.md`/i);
  assert.match(reactRoute, /For uncertainty beyond kernel\/repository contracts, consult `agent-rules\/reference\/typescript-react\.md`/i);
  assert.match(apiRoute, /For uncertainty beyond kernel\/repository contracts, consult `agent-rules\/reference\/backend-api\.md`/i);
  assert.match(apiRoute, /security\.md` for trust\/data protection/);
});

test('web guidance preserves product behavior, recovery, and accessibility evidence', async () => {
  const [webSource, interaction] = await Promise.all([source('contexts/web-ui.md'), source('contexts/web-interaction.md')]);
  const web = `${webSource}\n${interaction}`;
  for (const requirement of [
    /DOM text APIs or framework escaping/,
    /preserve it until deliberate recovery/,
    /action → named visible destination state/,
    /acknowledgement, not proof of the destination state/,
    /document overflow separately from intentional local table or chart scrolling/,
    /keyboard- and pointer-reachable/,
    /continued keyboard use/,
    /:focus-visible/,
    /prefers-reduced-motion/,
  ]) assert.match(web, requirement);
  assert.match(interaction, /\*\*UI-01 Interaction\.\*\* MUST keyboard-exercise changed UI actions through their resulting state/);
  assert.match(interaction, /Preserve unaffected drafts and focus\/caret\/selection across rendering/);
  assert.match(interaction, /if a focused control disappears, focus its trigger or a logical neighbor/);
  assert.match(web, /A clean heuristic scan does not establish safety or require a full-root rerun/);
});

test('fresh distributions contain no v4 hook, ledger, or report-gate contract', async (context) => {
  const output = await mkdtemp(path.join(tmpdir(), 'aer-guidance-v5-'));
  context.after(() => rm(output, { recursive: true, force: true }));
  await build(output);
  for (const [hostRoot, contractPath] of [
    ['claude/CLAUDE.md', 'claude/.claude/rules/core-contract.md'],
    ['codex/AGENTS.md', 'codex/AGENTS.md'],
  ]) {
    const [root, contract] = await Promise.all([
      readFile(path.join(output, hostRoot), 'utf8'),
      readFile(path.join(output, contractPath), 'utf8'),
    ]);
    assert.match(contract, /complete AND simple/);
    assert.match(contract, /AE-26 Completion/);
    assert.doesNotMatch(`${root}\n${contract}`, /aer-hook|session ledger|completion gate|required report block|Outcome:\s*DONE/i);
  }
  for (const host of ['claude', 'codex']) {
    const verification = await readFile(path.join(output, host, 'agent-rules/reference/verification.md'), 'utf8');
    assert.match(verification, /Optional diagnostics use `aer verify`/);
    assert.match(verification, /No fixed report layout is required/);
  }
});
