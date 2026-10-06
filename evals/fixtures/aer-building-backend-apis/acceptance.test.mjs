import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from './app.mjs';
async function setup(
  t,
  {
    actor = { subject: 'user', workspace: 'alpha' },
    reserve = async () => ({ ok: true, receiptId: 'r' }),
  } = {},
) {
  const records = new Map([
    ['a', { id: 'a', workspace: 'alpha', quantity: 1 }],
    ['b', { id: 'b', workspace: 'beta', quantity: 1 }],
  ]);
  const server = createServer({
    records,
    currentActor: () => actor,
    partner: { reserve },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { records, url: `http://127.0.0.1:${server.address().port}` };
}
test('case-1: trusted authentication and object authorization', async (t) => {
  const anonymous = await setup(t, { actor: null });
  assert.equal((await fetch(anonymous.url + '/records/a')).status, 401);
  const authenticated = await setup(t);
  const result = await fetch(authenticated.url + '/records/b');
  assert.equal(result.status, 403);
  assert.deepEqual(Object.keys(await result.json()), ['error']);
  assert.equal((await fetch(authenticated.url + '/missing')).status, 404);
});
test('case-2: malformed, oversized and invalid requests have no side effects', async (t) => {
  const calls = [];
  const { records, url } = await setup(t, {
    reserve: async (quantity) => {
      calls.push(quantity);
      return { ok: true, receiptId: 'r' };
    },
  });
  const before = structuredClone([...records]);
  for (const body of [
    '{broken',
    '{"quantity":-1}',
    '{"quantity":1,"extra":true}',
    '[]',
  ]) {
    assert.equal(
      (await fetch(url + '/records/a', { method: 'POST', body })).status,
      400,
    );
  }
  assert.equal(
    (
      await fetch(url + '/records/a', {
        method: 'POST',
        body: ' '.repeat(1025),
      })
    ).status,
    413,
  );
  assert.deepEqual(calls, []);
  assert.deepEqual([...records], before);
});
test('case-3: partner failures preserve data and successful receipts are normalized', async (t) => {
  for (const value of [null, { ok: false }, { ok: true, receiptId: '' }]) {
    const { records, url } = await setup(t, { reserve: async () => value });
    const before = structuredClone([...records]);
    assert.equal(
      (
        await fetch(url + '/records/a', {
          method: 'POST',
          body: '{"quantity":2}',
        })
      ).status,
      502,
    );
    assert.deepEqual([...records], before);
  }
  const { url } = await setup(t);
  const response = await fetch(url + '/records/a', {
    method: 'POST',
    body: '{"quantity":2}',
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.receiptId, 'r');
  assert.equal(body.quantity, 2);
  assert.equal(body.receipt, undefined);
});
