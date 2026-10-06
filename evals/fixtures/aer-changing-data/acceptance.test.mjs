import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate, readActive } from './app.mjs';
async function setup(t, rows) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aer-data-acceptance-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'rows.json');
  await writeFile(file, JSON.stringify(rows));
  return file;
}
async function rows(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}
test('case-1: exact legacy conversion and validate-before-write', async (t) => {
  const file = await setup(t, [{ id: 'a', archived: 'false', text: 'keep' }]);
  await migrate(file);
  assert.equal((await rows(file))[0].active, true);
  const invalid = await setup(t, [
    { id: 'a', archived: false },
    { id: 'b', archived: 'unknown' },
  ]);
  const before = await readFile(invalid);
  await assert.rejects(migrate(invalid));
  assert.deepEqual(await readFile(invalid), before);
});
test('case-2: interrupted retry preserves migrated meaning and legacy readers', async (t) => {
  const file = await setup(t, [
    { id: 'a', archived: true },
    { id: 'b', archived: false },
  ]);
  await assert.rejects(
    migrate(file, {
      afterWrite: async (index) => {
        if (index === 0) throw Error('interrupted');
      },
    }),
    /interrupted/,
  );
  await migrate(file);
  assert.deepEqual(await rows(file), [
    { id: 'a', archived: true, active: false },
    { id: 'b', archived: false, active: true },
  ]);
  const before = await readFile(file);
  await migrate(file);
  assert.deepEqual(await readFile(file), before);
});
test('case-3: mixed readers honor exact old values and authoritative new values', () => {
  assert.equal(readActive({ archived: 'false' }), true);
  assert.equal(readActive({ archived: true, active: true }), true);
  assert.throws(() => readActive({ archived: 'unknown' }));
  assert.throws(() => readActive({ active: 'true' }));
});
