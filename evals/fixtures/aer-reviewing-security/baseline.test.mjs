import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readInvoice, downloadPath, refreshSession } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  const invoices = new Map([['p', { workspace: 'alpha', totalCents: 100 }]]);
  assert.equal(
    readInvoice(invoices, { workspace: 'beta' }, 'p').totalCents,
    100,
  );
  const base = path.resolve('safe');
  assert.equal(
    downloadPath(base, '../private'),
    path.resolve(base, '../private'),
  );
  assert.equal(refreshSession({ expiresAt: 0 }, 100).expiresAt, 60100);
});
