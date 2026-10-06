import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJob } from './app.mjs';
async function setup(t, receipts = []) {
  const dir = await mkdtemp(path.join(tmpdir(), 'aer-job-acceptance-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'checkpoint.json');
  await writeFile(file, JSON.stringify({ receipts }));
  return file;
}
test('case-1: resume preserves receipts and skips delivered IDs', async (t) => {
  const file = await setup(t, [{ id: 'a', receipt: 'r-a' }]);
  const calls = [];
  await runJob(file, ['a', 'b'], {
    limit: 10,
    send: async (id, key) => {
      calls.push([id, key]);
      return `r-${id}`;
    },
  });
  assert.deepEqual(calls, [['b', 'b']]);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).receipts, [
    { id: 'a', receipt: 'r-a' },
    { id: 'b', receipt: 'r-b' },
  ]);
});
test('case-2: the limit stops work and paused is not done', async (t) => {
  const file = await setup(t);
  const calls = [];
  assert.deepEqual(
    await runJob(file, ['a', 'b'], {
      limit: 1,
      send: async (id) => {
        calls.push(id);
        return `r-${id}`;
      },
    }),
    { sent: 1, status: 'paused' },
  );
  assert.deepEqual(calls, ['a']);
  assert.deepEqual(
    await runJob(file, ['a', 'b'], { limit: 1, send: async (id) => `r-${id}` }),
    { sent: 1, status: 'done' },
  );
});
test('case-3: corrupt checkpoints cannot cause sends or writes', async (t) => {
  const file = await setup(t, [{ id: 'a', receipt: '' }]);
  const before = await readFile(file);
  const calls = [];
  await assert.rejects(
    runJob(file, ['a'], {
      limit: 1,
      send: async (id) => {
        calls.push(id);
        return 'r';
      },
    }),
  );
  assert.deepEqual(calls, []);
  assert.deepEqual(await readFile(file), before);
});
