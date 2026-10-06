export function saveNote(store, id, value) {
  if (typeof id !== 'string' || !id) throw new TypeError('id');
  store.set(id, { id, value, favorite: false, archived: false });
  return store.get(id);
}
export function setFavorite(store, id, favorite) {
  if (!store.has(id)) throw new Error('not found');
  return store.get(id);
}
export function archiveMany(store, ids) {
  for (const id of ids) {
    if (!store.has(id)) throw new Error('not found');
    store.set(id, { ...store.get(id), archived: true });
  }
}
export function undo(store, id) {
  throw new Error('undo unavailable');
}
