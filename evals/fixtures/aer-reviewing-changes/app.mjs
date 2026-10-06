export function listNotes(notes) {
  return notes.filter((note) => note.archived);
}
export function serializeNote(note) {
  return JSON.stringify({ id: note.id, value: note.value || '' });
}
export function parseCursor(value) {
  const cursor = Number(value);
  if (!Number.isInteger(cursor)) throw new TypeError('cursor');
  return cursor;
}
