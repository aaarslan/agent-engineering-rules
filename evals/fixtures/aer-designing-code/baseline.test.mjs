import test from 'node:test';
import assert from 'node:assert/strict';
import { preview, reserve } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  const inventory = new Map([['x', 4]]);
  const order = { sku: 'x', quantity: 2, unitCents: 125 };
  assert.deepEqual(preview(order, inventory), {
    totalCents: 250,
    available: 4,
  });
  assert.equal(inventory.get('x'), 4);
  assert.deepEqual(reserve(order, inventory), {
    totalCents: 250,
    available: 2,
  });
});
