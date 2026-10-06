import test from 'node:test';
import assert from 'node:assert/strict';
import { listNotes, serializeNote, parseCursor } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  assert.equal(
    listNotes([
      { id: 'active', archived: false },
      { id: 'old', archived: true },
    ])[0].id,
    'old',
  );
  assert.equal(
    serializeNote({ id: 'n', value: null }),
    '{"id":"n","value":""}',
  );
  assert.equal(parseCursor('-1'), -1);
});
