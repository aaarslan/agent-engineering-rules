import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate, readActive } from './app.mjs';
test('fixture setup and known starting behavior', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aer-data-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'rows.json');
  await writeFile(
    file,
    JSON.stringify([{ id: 'a', archived: 'false', text: 'keep' }]),
  );
  await migrate(file);
  assert.equal(JSON.parse(await readFile(file, 'utf8'))[0].active, false);
  assert.equal(readActive({ archived: 'false' }), false);
});
