import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJob } from './app.mjs';
test('fixture setup and known starting behavior', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aer-job-fixture-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'checkpoint.json');
  await writeFile(
    file,
    JSON.stringify({ receipts: [{ id: 'a', receipt: 'r-a' }] }),
  );
  const calls = [];
  const result = await runJob(file, ['a', 'b'], {
    limit: 1,
    send: async (id) => {
      calls.push(id);
      return `r-${id}`;
    },
  });
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(result.status, 'done');
  assert.equal(JSON.parse(await readFile(file, 'utf8')).receipts.length, 3);
});
