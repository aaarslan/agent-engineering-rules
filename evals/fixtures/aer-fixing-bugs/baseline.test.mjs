import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  const notes = new Map([
    ['a', 'old'],
    ['b', 'keep'],
  ]);
  const e = new Editor(notes);
  e.edit('a');
  e.change('revised');
  await assert.rejects(
    e.save(async () => {
      throw new Error('offline');
    }),
  );
  assert.equal(e.draft, '');
  e.cancel();
  assert.equal(notes.size, 0);
});
