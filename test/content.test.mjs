import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseSkill, readPackage, ROOT } from '../src/payload.mjs';
import { validateV6, resourceErrors } from '../tools/validate-v6.mjs';
import { routingErrors } from '../tools/validate-evals.mjs';
import {
  analyzeRuntimeLoads,
  runtimeLoadErrors,
} from '../tools/validate-runtime-loads.mjs';
import { schemaErrors } from '../tools/schema.mjs';
import { ownedHash, uniqueJson } from '../src/fs-safe.mjs';
import { retireReferences } from '../tools/render-v6.mjs';

test('final content, representations, self-contained resources and loads validate', async () => {
  assert.deepEqual((await validateV6()).errors, []);
  assert.deepEqual(runtimeLoadErrors(await analyzeRuntimeLoads()), []);
});
test('negative format fixtures reject malformed YAML, duplicate fields, types, encoding and placeholders', () => {
  const make = (fields, body = 'Do the bounded work.') =>
    Buffer.from(`---\n${fields}\n---\n\n${body}\n`);
  assert.equal(
    parseSkill(
      make('name: "aer-test"\ndescription: "A quoted: value"'),
      'aer-test',
    ).name,
    'aer-test',
  );
  for (const bytes of [
    make('name: "aer-test"\nname: "aer-test"\ndescription: "x"'),
    make('name: true\ndescription: "x"'),
    make('name: "aer-test"\ndescription: 4'),
    make('name: "other"\ndescription: "x"'),
    make('name: aer-test\ndescription: x'),
    make('name: "aer-test"\ndescription: "x"', '$ARGUMENTS'),
    Buffer.from([0xff]),
  ])
    assert.throws(() => parseSkill(bytes, 'aer-test'));
  const files = new Map([
    [
      'skills/aer-test/SKILL.md',
      Buffer.from(
        'Read `references/missing.md` and [escaping](../../outside.md).',
      ),
    ],
  ]);
  assert.equal(resourceErrors(files, 'skills/aer-test').length, 2);
});

test('reference retirement removes only generated obsolete resources', async (t) => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'aer-reference-retirement-'),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await retireReferences(path.join(directory, 'not-created'), [
    'new-reference.md',
  ]);
  const obsolete = path.join(directory, 'obsolete.md');
  await writeFile(
    obsolete,
    '<!-- Generated from source/shared/obsolete.md by tools/render-v6.mjs -->\nOld reference.\n',
  );
  await assert.rejects(
    retireReferences(directory, [], { check: true }),
    /obsolete generated/,
  );
  await retireReferences(directory, []);
  await assert.rejects(readFile(obsolete), { code: 'ENOENT' });
  const manual = path.join(directory, 'manual.md');
  await writeFile(manual, 'Contributor-owned guidance.\n');
  await assert.rejects(retireReferences(directory, []), /unowned reference/);
  assert.equal(await readFile(manual, 'utf8'), 'Contributor-owned guidance.\n');
});
test('published schemas reject closed-shape and wrong-type output/inventory fixtures', async () => {
  const schema = JSON.parse(
      await readFile(
        path.join(ROOT, 'schemas/payload-manifest.schema.json'),
        'utf8',
      ),
    ),
    pkg = await readPackage();
  assert.deepEqual(schemaErrors(pkg.manifest, schema), []);
  assert.ok(schemaErrors({ ...pkg.manifest, unknown: true }, schema).length);
  const wrong = structuredClone(pkg.manifest);
  wrong.files[0].sha256 = 'bad';
  assert.ok(schemaErrors(wrong, schema).length);
  const output = JSON.parse(
    await readFile(path.join(ROOT, 'schemas/output.schema.json'), 'utf8'),
  );
  assert.ok(
    schemaErrors({ schemaVersion: 1, status: 'current', exitCode: '0' }, output)
      .length,
  );
});
test('routing permits multiple useful skills and forbids implicit manual-only selection', async () => {
  const pkg = await readPackage(),
    doc = JSON.parse(
      await readFile(
        path.join(ROOT, 'evals/routing/catalog-cases.json'),
        'utf8',
      ),
    );
  assert.deepEqual(routingErrors(doc, pkg.clients.skills), []);
  const bad = structuredClone(doc);
  bad.cases[0].supporting.push('aer-reviewing-security');
  assert.ok(
    routingErrors(bad, pkg.clients.skills).some((e) =>
      e.includes('manual-only'),
    ),
  );
  const multi = doc.cases.find((c) => c.id === 'authenticated-api-migration');
  assert.equal(multi.supporting.length, 3);
});
test('semantic counterexamples and generation freshness protect reviewed changes and UI placement', async () => {
  const pkg = await readPackage();
  const kernel = pkg.sources.get('kernel/contract.md').toString();
  assert.match(
    kernel,
    /Implement authorized local APIs without renewed approval/,
  );
  assert.match(kernel, /Stop expanding when uncertainty no longer affects/);
  assert.match(kernel, /Report exact unavailable environments/);
  assert.match(kernel, /no mandatory empty sections/);
  assert.match(
    pkg.sources
      .get('skills/aer-designing-code/references/errors-and-side-effects.md')
      .toString(),
    /nonmaterial cleanup/,
  );
  assert.match(
    pkg.sources
      .get('skills/aer-designing-code/references/boundaries.md')
      .toString(),
    /framework-native repository conventions/,
  );
  const r = await analyzeRuntimeLoads();
  assert.ok(
    r.plans.filter((p) => p.mode === 'plugin-kernel').every((p) => p.uiClause),
  );
  const broken = structuredClone(r);
  broken.plans[0].uiClause = false;
  assert.ok(runtimeLoadErrors(broken).length);
  const tooManyLines = structuredClone(r);
  tooManyLines.plans[0].blockLines =
    pkg.thresholds.KERNEL_MAX_PHYSICAL_LINES + 1;
  assert.ok(runtimeLoadErrors(tooManyLines).length);
});
test('normalization is declared text only; duplicate JSON fields and unknown client metadata refuse', async (t) => {
  const binary = Buffer.from([0, 13, 10, 255]);
  assert.notEqual(
    ownedHash(binary, 'binary'),
    ownedHash(Buffer.from([0, 10, 255]), 'binary'),
  );
  assert.equal(
    ownedHash(Buffer.from('text\r\n')),
    ownedHash(Buffer.from('text\n')),
  );
  assert.throws(
    () => uniqueJson('{"schemaVersion":1,"schemaVersion":1}', 'fixture'),
    /duplicate JSON field/,
  );
  const root = await mkdtemp(path.join(tmpdir(), 'aer-bad-integration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const p of [
    'package.json',
    'kernel',
    'skills',
    'integrations',
    'src',
    'schemas',
  ])
    await cp(path.join(ROOT, p), path.join(root, p), { recursive: true });
  const file = path.join(root, 'integrations/clients.json'),
    doc = JSON.parse(await readFile(file, 'utf8'));
  doc.clients.codex.capabilities.push('permission-grant');
  await writeFile(file, JSON.stringify(doc));
  await assert.rejects(
    readPackage(root, { inventory: false }),
    /unknown integration capability/,
  );
});
