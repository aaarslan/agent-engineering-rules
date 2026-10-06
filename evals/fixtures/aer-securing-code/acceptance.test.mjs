import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocument, updateDocument, listDocuments } from './app.mjs';
const actor = { subject: 'user', workspace: 'alpha' };
function documents() {
  return new Map([
    ['a', { id: 'a', workspace: 'alpha', text: 'Alpha' }],
    ['b', { id: 'b', workspace: 'beta', text: 'Beta' }],
  ]);
}
test('case-1: authentication and workspace access', () => {
  const store = documents();
  assert.throws(() => readDocument(store, null, 'a'), /unauthenticated/);
  assert.throws(() => readDocument(store, actor, 'b'), /forbidden/);
  assert.equal(readDocument(store, actor, 'a').text, 'Alpha');
});
test('case-2: denied or malformed writes leave the store unchanged', () => {
  const store = documents();
  const before = structuredClone([...store]);
  assert.throws(
    () => updateDocument(store, actor, 'b', 'changed'),
    /forbidden/,
  );
  assert.throws(() => updateDocument(store, actor, 'a', 7));
  assert.deepEqual([...store], before);
});
test('case-3: listing filters workspace and returns copies', () => {
  const store = documents();
  const visible = listDocuments(store, actor);
  assert.deepEqual(
    visible.map((doc) => doc.id),
    ['a'],
  );
  visible[0].text = 'outside mutation';
  assert.equal(store.get('a').text, 'Alpha');
});
