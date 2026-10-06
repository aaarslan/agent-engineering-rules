export function parseCommand(args) {
  if (args.length !== 2 || args[0] !== 'show')
    throw new TypeError('usage: show ID');
  if (!/^[a-z][a-z0-9-]*$/.test(args[1])) throw new TypeError('id');
  return { command: 'show', id: args[1] };
}
export function showNote(notes, id) {
  if (!notes.has(id)) throw new Error('not found');
  return JSON.stringify({ id, text: notes.get(id) }) + '\n';
}
