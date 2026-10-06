export class Editor {
  constructor(notes) {
    this.notes = notes;
    this.id = null;
    this.draft = '';
  }
  edit(id) {
    if (!this.notes.has(id)) throw new Error('not found');
    this.id = id;
    this.draft = this.notes.get(id);
  }
  change(value) {
    this.draft = value;
  }
  async save(write) {
    const value = this.draft;
    this.draft = '';
    await write(this.id, value);
    this.notes.set(this.id, value);
  }
  cancel() {
    this.notes.clear();
    this.draft = '';
  }
}
