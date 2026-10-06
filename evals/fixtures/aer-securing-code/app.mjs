export function readDocument(documents, actor, id) {
  const doc = documents.get(id);
  if (!doc) throw new Error('not found');
  return { ...doc };
}
export function updateDocument(documents, actor, id, text) {
  const doc = documents.get(id);
  if (!doc) throw new Error('not found');
  documents.set(id, { ...doc, text });
  return { ...documents.get(id) };
}
export function listDocuments(documents, actor) {
  return [...documents.values()];
}
