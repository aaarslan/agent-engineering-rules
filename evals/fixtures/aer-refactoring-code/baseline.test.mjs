import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteForScreen, quoteForReceipt, quoteForExport } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  const rows = [
    { quantity: 2, unitCents: 149 },
    { quantity: 1, unitCents: 3 },
  ];
  assert.equal(quoteForScreen(rows), 301);
  assert.deepEqual(quoteForReceipt(rows), { totalCents: 301, currency: 'USD' });
  assert.equal(quoteForExport(rows), '{"totalCents":301,"currency":"USD"}');
});
