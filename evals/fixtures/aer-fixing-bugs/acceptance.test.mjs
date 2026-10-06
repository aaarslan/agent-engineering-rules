import test from 'node:test';
import assert from 'node:assert/strict';
import { Editor } from './app.mjs';
function editor() {
  const result = new Editor(
    new Map([
      ['a', 'Alpha'],
      ['b', 'Beta'],
    ]),
  );
  result.edit('a');
  result.change('revised');
  return result;
}
test('case-1: rejected save retains a retryable draft', async () => {
  const result = editor();
  await assert.rejects(
    result.save(async () => {
      throw new Error('offline');
    }),
    /offline/,
  );
  assert.equal(result.draft, 'revised');
  const calls = [];
  await result.save(async (...args) => calls.push(args));
  assert.deepEqual(calls, [['a', 'revised']]);
  assert.equal(result.notes.get('b'), 'Beta');
});
test('case-2: cancel preserves all saved notes', () => {
  const result = editor();
  result.cancel();
  assert.deepEqual(
    [...result.notes],
    [
      ['a', 'Alpha'],
      ['b', 'Beta'],
    ],
  );
  assert.equal(result.draft, 'Alpha');
});
test('case-3: pending save owns its captured note and draft', async () => {
  const result = editor();
  let resolveWrite;
  const pending = result.save(
    () =>
      new Promise((resolve) => {
        resolveWrite = resolve;
      }),
  );
  result.edit('b');
  result.change('new Beta draft');
  resolveWrite();
  await pending;
  assert.equal(result.notes.get('a'), 'revised');
  assert.equal(result.notes.get('b'), 'Beta');
  assert.equal(result.draft, 'new Beta draft');
});
