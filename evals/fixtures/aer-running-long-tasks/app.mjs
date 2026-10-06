import { readFile, writeFile } from 'node:fs/promises';

export async function runJob(file, ids, { limit, send }) {
  const state = JSON.parse(await readFile(file, 'utf8'));
  let sent = 0;
  for (const id of ids) {
    const receipt = await send(id, id);
    state.receipts.push({ id, receipt });
    await writeFile(file, JSON.stringify(state));
    sent++;
  }
  return { sent, status: 'done' };
}
