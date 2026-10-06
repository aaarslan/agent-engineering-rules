import test from 'node:test';
import assert from 'node:assert/strict';
import { saveNote, setFavorite, archiveMany, undo } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  const store = new Map();
  saveNote(store, 'n', 'draft');
  assert.equal(setFavorite(store, 'n', true).favorite, false);
  assert.throws(() => archiveMany(store, ['n', 'missing']), /not found/);
  assert.equal(store.get('n').archived, true);
  assert.throws(() => undo(store, 'n'), /unavailable/);
});
