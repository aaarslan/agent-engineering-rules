import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, showNote } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  assert.deepEqual(parseCommand(['show', 'note-1']), {
    command: 'show',
    id: 'note-1',
  });
  assert.throws(() => parseCommand(['show', 'Bad']), /id/);
  assert.equal(
    showNote(new Map([['n', 'hello']]), 'n'),
    '{"id":"n","text":"hello"}\n',
  );
});
