import { readFile, writeFile } from 'node:fs/promises';

export function readActive(row) {
  return row.active ?? !Boolean(row.archived);
}
export async function migrate(file, { afterWrite = async () => {} } = {}) {
  const rows = JSON.parse(await readFile(file, 'utf8'));
  for (let index = 0; index < rows.length; index++) {
    rows[index].active = !Boolean(rows[index].archived);
    delete rows[index].archived;
    await writeFile(file, JSON.stringify(rows));
    await afterWrite(index);
  }
  return rows.length;
}
