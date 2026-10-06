import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCheck, summarizeChecks } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  assert.equal(
    classifyCheck({ exitCode: 0, stdout: '', status: 'completed' }),
    'pass',
  );
  assert.equal(
    classifyCheck({ exitCode: 0, stdout: 'PASS', status: 'timed-out' }),
    'pass',
  );
  assert.equal(summarizeChecks([]), 'done');
});
