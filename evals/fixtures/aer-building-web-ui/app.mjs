export function readNotes(storage) {
  try {
    return JSON.parse(storage.getItem('notes') ?? '[]');
  } catch {
    storage.setItem('notes', '[]');
    return [];
  }
}
export function mount(root, storage) {
  let notes = readNotes(storage);
  let editing = null;
  function render() {
    root.innerHTML = `<p id="status" role="status"></p><ul>${notes.map((note) => `<li><span>${note.text}</span><button data-toggle="${note.id}">${note.done ? 'Reopen' : 'Done'}</button><button data-edit="${note.id}">Edit</button></li>`).join('')}</ul>${editing ? '<label>Note <input id="draft"></label><button id="save">Save</button><button id="cancel">Cancel</button>' : ''}`;
    for (const button of root.querySelectorAll('[data-toggle]'))
      button.onclick = () => {
        const note = notes.find((item) => item.id === button.dataset.toggle);
        note.done = !note.done;
        storage.setItem('notes', JSON.stringify(notes));
        render();
      };
    for (const button of root.querySelectorAll('[data-edit]'))
      button.onclick = () => {
        editing = button.dataset.edit;
        render();
        root.querySelector('#draft').value = notes.find(
          (note) => note.id === editing,
        ).text;
      };
    if (editing) {
      root.querySelector('#cancel').onclick = () => {
        editing = null;
        render();
      };
      root.querySelector('#save').onclick = () => {
        notes.find((note) => note.id === editing).text =
          root.querySelector('#draft').value;
        storage.setItem('notes', JSON.stringify(notes));
        editing = null;
        render();
      };
    }
  }
  render();
}
