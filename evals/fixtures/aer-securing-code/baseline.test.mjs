import test from 'node:test';
import assert from 'node:assert/strict';
import { readDocument, updateDocument, listDocuments } from './app.mjs';
test('fixture setup and known starting behavior', async () => {
  const docs = new Map([
    ['private', { id: 'private', workspace: 'alpha', text: 'secret' }],
  ]);
  assert.equal(
    readDocument(docs, { workspace: 'beta' }, 'private').text,
    'secret',
  );
  updateDocument(docs, null, 'private', 'changed');
  assert.equal(docs.get('private').text, 'changed');
  assert.equal(listDocuments(docs, { workspace: 'beta' }).length, 1);
});
