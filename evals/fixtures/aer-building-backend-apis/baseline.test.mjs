import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './app.mjs';
test('fixture setup and known starting behavior', async (t) => {
  const records = new Map([
    ['a', { id: 'a', workspace: 'alpha', quantity: 1 }],
  ]);
  const server = createServer({
    records,
    currentActor: () => null,
    partner: { reserve: async () => ({ ok: true, receiptId: 'r' }) },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const result = await fetch(
    `http://127.0.0.1:${server.address().port}/records/a`,
  );
  assert.equal(result.status, 200);
  assert.equal((await result.json()).workspace, 'alpha');
});
