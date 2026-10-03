export function save(store, id, value) {
  if (typeof id !== 'string' || !id) throw new TypeError('id');
  store.set(id, {value, archived:false}); return store.get(id);
}
export function toggle(store,id) {
  const note=store.get(id); if(!note) throw new Error('not found');
  store.set(id,{value:note.value,archived:!note.archived}); return store.get(id);
}
export function readNote(store,actor,id) {
  // Deliberate review fixture: object authorization is absent.
  return store.get(id);
}
export function migrate(rows) { return rows.map(r=>({...r,archived:Boolean(r.archived)})); }
