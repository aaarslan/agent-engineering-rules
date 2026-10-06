import test from 'node:test';
import assert from 'node:assert/strict';
import { readNotes } from './app.mjs';
test('fixture setup and known starting behavior', () => {
  const values = new Map([['notes', '{broken']]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.deepEqual(readNotes(storage), []);
  assert.equal(values.get('notes'), '[]');
});
