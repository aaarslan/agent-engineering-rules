import { readFile, lstat, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, readPackage, closed } from '../src/payload.mjs';
import { safePath } from '../src/fs-safe.mjs';

export function routingErrors(doc, catalog) {
  const errors = [],
    known = new Set(catalog.map((s) => s.name)),
    manual = new Set(catalog.filter((s) => s.manualOnly).map((s) => s.name)),
    ids = new Set();
  if (
    doc.schemaVersion !== 1 ||
    [...known].sort().join() !== [...doc.catalog].sort().join()
  )
    errors.push('competing catalog mismatch');
  for (const c of doc.cases ?? []) {
    try {
      closed(
        c,
        [
          'id',
          'prompt',
          'explicitInvocation',
          'primary',
          'supporting',
          'forbidden',
        ],
        'routing case',
      );
    } catch (e) {
      errors.push(e.message);
      continue;
    }
    if (ids.has(c.id) || !c.prompt.trim())
      errors.push('duplicate/empty routing case');
    ids.add(c.id);
    const listed = [...c.primary, ...c.supporting, ...c.forbidden];
    if (
      new Set(listed).size !== listed.length ||
      listed.some((n) => !known.has(n))
    )
      errors.push(`${c.id}: conflicting/unknown routing sets`);
    if (c.explicitInvocation !== null && !known.has(c.explicitInvocation))
      errors.push(`${c.id}: unknown explicit route`);
    if (
      [...c.primary, ...c.supporting].some(
        (n) => manual.has(n) && n !== c.explicitInvocation,
      )
    )
      errors.push(`${c.id}: bypasses manual-only invocation`);
  }
  return errors;
}
export async function validateEvals({ executeFixtures = true } = {}) {
  const pkg = await readPackage();
  const json = async (p) =>
    JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
  const routing = await json('evals/routing/catalog-cases.json'),
    behavior = await json('evals/behavior/cases.json'),
    rubric = await json('evals/behavior/rubric.json'),
    index = await json('evals/behavior/study-index.json');
  const directives = await json('research/evals/directives.json');
  const liveIds = new Set(
    directives.directives.map((directive) => directive.id),
  );
  const errors = routingErrors(routing, pkg.clients.skills),
    fixtures = new Set(),
    ids = new Set();
  if (
    behavior.schemaVersion !== 1 ||
    behavior.status !== 'prepared-not-executed-model-trials' ||
    !/^\d+\.\d+\.\d+$/.test(behavior.fixtureRevision ?? '') ||
    rubric.schemaVersion !== 1 ||
    !rubric.frozenBeforeComparison ||
    index.schemaVersion !== 1 ||
    index.comparisons.length !== 4
  )
    errors.push('invalid evaluation design contract');
  for (const c of behavior.cases) {
    if (
      ids.has(c.id) ||
      !pkg.skills.has(c.skill) ||
      !c.setup ||
      !c.cleanup ||
      !c.requirementsDisclosed
    )
      errors.push(`invalid behavior case ${c.id}`);
    ids.add(c.id);
    if (
      !Array.isArray(c.coverage) ||
      !c.coverage.length ||
      new Set(c.coverage).size !== c.coverage.length ||
      c.coverage.some((id) => !liveIds.has(id))
    )
      errors.push(`${c.id}: invalid intended directive coverage`);
    if (c.contract !== `${c.fixture}/contract.md`)
      errors.push(`${c.id}: missing fixture acceptance contract`);
    for (const p of [
      c.fixture,
      c.prompt,
      c.rubric,
      c.contract,
      ...(c.acceptance ? [c.acceptance] : []),
    ]) {
      try {
        safePath(p);
        const stat = await lstat(path.join(ROOT, p));
        if (stat.isSymbolicLink()) throw Error('symlink');
      } catch (e) {
        errors.push(`${c.id}: invalid fixture resource ${p}: ${e.message}`);
      }
    }
    if (
      JSON.stringify(c.baselineCommand) !==
      JSON.stringify(['node', '--test', 'baseline.test.mjs'])
    )
      errors.push(`${c.id}: unsupported fixture setup command`);
    if (c.acceptance) {
      const caseNumber = c.id.split('-').at(-1);
      const command = [
        'node',
        '--test',
        `--test-name-pattern=^case-${caseNumber}:`,
        'acceptance.test.mjs',
      ];
      if (
        c.acceptance !== `${c.fixture}/acceptance.test.mjs` ||
        JSON.stringify(c.acceptanceCommand) !== JSON.stringify(command) ||
        c.seedAcceptanceFailures !== 1
      )
        errors.push(`${c.id}: invalid seed calibration command`);
    }
    fixtures.add(c.fixture);
  }
  let calibratedCases = 0;
  if (executeFixtures && !errors.length) {
    const temporary = await mkdtemp(path.join(tmpdir(), 'aer-eval-fixtures-'));
    try {
      const env = { ...process.env, NODE_TEST_REPORTER: 'tap' };
      delete env.NODE_TEST_CONTEXT;
      const run = (fixture, args) =>
        spawnSync(process.execPath, ['--test-reporter=tap', ...args], {
          cwd: path.join(temporary, path.basename(fixture)),
          env,
          encoding: 'utf8',
          timeout: 10000,
          windowsHide: true,
        });
      for (const fixture of fixtures) {
        await cp(
          path.join(ROOT, fixture),
          path.join(temporary, path.basename(fixture)),
          { recursive: true },
        );
        const result = run(fixture, ['--test', 'baseline.test.mjs']);
        if (result.status !== 0 || !/^# pass 1$/m.test(result.stdout))
          errors.push(
            `${fixture}: baseline not runnable: ${result.stderr || result.error || result.stdout}`,
          );
      }
      for (const behaviorCase of behavior.cases.filter(
        (item) => item.acceptance,
      )) {
        const result = run(
          behaviorCase.fixture,
          behaviorCase.acceptanceCommand.slice(1),
        );
        if (
          result.status !== 1 ||
          !/^# fail 1$/m.test(result.stdout) ||
          !/^# pass 0$/m.test(result.stdout) ||
          !new RegExp(
            `^not ok \\d+ - case-${behaviorCase.id.split('-').at(-1)}:`,
            'm',
          ).test(result.stdout) ||
          !/failureType: 'testCodeFailure'/m.test(result.stdout)
        )
          errors.push(
            `${behaviorCase.id}: seeded defect was not detected by the disclosed acceptance check: ${result.stderr || result.error || result.stdout}`,
          );
        else calibratedCases++;
      }
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  return {
    errors,
    routingCases: routing.cases.length,
    behaviorCases: behavior.cases.length,
    fixtureBaselines: fixtures.size,
    calibratedCases,
    modelTrials: 0,
  };
}
if (process.argv[1]?.endsWith('validate-evals.mjs'))
  validateEvals()
    .then((r) => {
      console.log(JSON.stringify(r));
      if (r.errors.length) process.exitCode = 1;
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
