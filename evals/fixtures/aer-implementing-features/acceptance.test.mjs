import test from 'node:test';
import assert from 'node:assert/strict';
import { saveNote, setFavorite, archiveMany, undo } from './app.mjs';
function notes() {
  const store = new Map();
  saveNote(store, 'a', 'Alpha');
  saveNote(store, 'b', 'Beta');
  return store;
}
test('case-1: favorite state and malformed flags', () => {
  const store = notes();
  assert.equal(setFavorite(store, 'a', true).favorite, true);
  assert.equal(store.get('a').favorite, true);
  assert.throws(() => setFavorite(store, 'a', 'false'), TypeError);
  assert.equal(store.get('b').favorite, false);
});
test('case-2: invalid batch cannot partially archive', () => {
  const store = notes();
  const before = structuredClone([...store]);
  assert.throws(() => archiveMany(store, ['a', 'missing']), /not found/);
  assert.deepEqual([...store], before);
  archiveMany(store, ['a', 'b']);
  assert.ok([...store.values()].every((note) => note.archived));
});
test('case-3: undo is scoped to the most recent note mutation', () => {
  const store = notes();
  archiveMany(store, ['a']);
  archiveMany(store, ['b']);
  undo(store, 'a');
  assert.equal(store.get('a').archived, false);
  assert.equal(store.get('b').archived, true);
  assert.throws(() => undo(store, 'a'), /nothing to undo/);
});
