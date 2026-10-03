import { lstat, open, readFile, readdir, realpath, rename, unlink, mkdir, rmdir } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import { THRESHOLDS, requiredThreshold } from './thresholds.mjs';

export const STATE = 'aer.lock.json';
export const RUN_LOCK = '.aer.run.lock';
export class AerError extends Error {
  constructor(message, exitCode = 3, status = 'refused', details = {}) {
    super(message); Object.assign(this, { exitCode, status, ...details });
  }
}
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function utf8(bytes, label) {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new AerError(`${label}: invalid UTF-8`, 3); }
}
export const ownedHash = (bytes, normalization = 'utf8-lf') => hash(normalization === 'utf8-lf' ? utf8(bytes, 'text resource').replace(/\r\n/g, '\n') : bytes);
export function uniqueJson(text,label) {
  const value=JSON.parse(text),stack=[];
  for(const token of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g)) {
    const v=token[0];
    if(v==='{')stack.push({keys:new Set(),expectKey:true});
    else if(v==='[')stack.push(null);
    else if(v==='}'||v===']')stack.pop();
    else if(v===','&&stack.at(-1))stack.at(-1).expectKey=true;
    else if(v.startsWith('"')&&stack.at(-1)?.expectKey) {
      const frame=stack.at(-1),key=JSON.parse(v);
      if(frame.keys.has(key))throw new AerError(`${label}: duplicate JSON field ${key}`,4,'invalid');
      frame.keys.add(key);frame.expectKey=false;
    }
  }
  return value;
}
export function safePath(value) {
  if (typeof value !== 'string' || !value || value !== value.normalize('NFC') || value.length > requiredThreshold(THRESHOLDS,'PATH_MAX_CHARACTERS') || /[\p{Cc}\p{Cf}\\]/u.test(value) || path.posix.isAbsolute(value) || path.posix.normalize(value) !== value)
    throw new AerError(`unsafe project-relative path: ${value}`);
  const device = /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
  if (value.split('/').some(p => !p || p === '.' || p === '..' || /[<>:"|?*]|[. ]$/.test(p) || device.test(p))) throw new AerError(`unsafe portable path: ${value}`);
  return value;
}
export const resolvePath = (root, relative) => path.join(root, ...safePath(relative).split('/'));
export async function parents(root, relative) {
  let current = root;
  for (const part of safePath(relative).split('/').slice(0, -1)) {
    current = path.join(current, part);
    try { const s = await lstat(current); if (!s.isDirectory() || s.isSymbolicLink()) throw new AerError(`unsafe parent: ${current}`); }
    catch (e) { if (e.code === 'ENOENT') return; throw e; }
  }
}
export async function snapshot(root, relative, maxBytes = requiredThreshold(THRESHOLDS,'INPUT_FILE_MAX_BYTES')) {
  await parents(root, relative);
  const file = resolvePath(root, relative);
  let s;
  try { s = await lstat(file,{bigint:true}); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1n || s.size > BigInt(maxBytes)) throw new AerError(`unsafe file, link or oversized input: ${relative}`);
  const h = await open(file, 'r');
  try {
    const a = await h.stat({bigint:true});
    const bytes = await h.readFile(); const b = await lstat(file,{bigint:true});
    if (!a.isFile() || !b.isFile() || a.nlink !== 1n || b.nlink !== 1n || !identity(s, a) || !identity(a, b) || a.size !== b.size || a.mtimeNs !== b.mtimeNs || BigInt(bytes.length) !== b.size)
      throw new AerError(`${relative} changed during snapshot`, 4, 'unstable-snapshot');
    return { bytes, dev: device(b.dev).toString(), ino: b.ino.toString(), birthtimeNs: b.birthtimeNs.toString(), mode: Number(b.mode & 0o777n) };
  } finally { await h.close(); }
}
// Older Windows libuv path stat reports a 64-bit volume serial while fstat
// reports its low 32 bits. Current libuv consistently uses the low 32 bits.
// BigInt retains the exact inode and timestamp; Number can round their identity.
const device=value=>process.platform==='win32'?BigInt(value)&0xffffffffn:BigInt(value);
function identity(a, b) { return device(a.dev) === device(b.dev) && BigInt(a.ino) === BigInt(b.ino) && (BigInt(a.ino) !== 0n || BigInt(a.birthtimeNs) === BigInt(b.birthtimeNs)); }
export function sameSnapshot(a, b) { return a === null || b === null ? a === b : identity(a,b) && a.bytes.equals(b.bytes); }
export async function guard(root, relative, expected) {
  if (!sameSnapshot(expected, await snapshot(root, relative))) throw new AerError(`${relative} changed after inspection; retain pending operation`, 4, 'interrupted');
}
export const temporaryPath=(relative,id)=>`${relative}.aer-${id}.tmp`;
export async function replace(root, relative, content, expected, {operationId = randomUUID(), boundary} = {}) {
  await parents(root, relative); await guard(root, relative, expected);
  const file = resolvePath(root, relative);
  if (content === null) { if (expected !== null) await unlink(file); return; }
  await mkdir(path.dirname(file), { recursive: true });
  await parents(root, relative);
  const temp = resolvePath(root,temporaryPath(relative,operationId));
  let h,created,written=false;
  try {
    h = await open(temp, 'wx', expected?.mode ?? 0o644);created=await h.stat({bigint:true});await boundary?.('temporary-created',relative);
    await h.writeFile(content);written=true;await h.sync();await boundary?.('temporary-synced',relative);await h.close(); h = null;
    await guard(root, relative, expected); await rename(temp, file);
  } finally {
    await h?.close();
    if(created) {
      const current=await snapshot(root,temporaryPath(relative,operationId));
      if(current&&identity(created,current)&&current.bytes.equals(written?Buffer.from(content):Buffer.alloc(0))) {
        await guard(root,temporaryPath(relative,operationId),current);await unlink(temp);
      }
    }
  }
}
export async function recoverTemporary(root,relative,id,expectedHash) {
 const p=temporaryPath(relative,id),s=await snapshot(root,p);
 if(!s)return;
 if(expectedHash===null||hash(s.bytes)!==expectedHash)throw new AerError(`partial or modified temporary ${p}; back it up and inspect the recorded operation before manual removal`,4,'interrupted');
 await guard(root,p,s);await unlink(resolvePath(root,p));
}
export async function walk(root, relative = '') {
  const files = [];
  for (const e of await readdir(relative ? resolvePath(root, relative) : root, { withFileTypes:true })) {
    const p = relative ? `${relative}/${e.name}` : e.name; safePath(p);
    if(e.isSymbolicLink()) throw new AerError(`symlink in inventory: ${p}`);
    if(e.isDirectory()) files.push(...await walk(root,p));
    else if(e.isFile()) files.push(p); else throw new AerError(`unsupported entry: ${p}`);
  }
  return files.sort();
}
export async function targetRoot(requested, packageRoot) {
  let root;
  try { root = await realpath(path.resolve(requested)); if(!(await lstat(root)).isDirectory()) throw Error(); }
  catch { throw new AerError(`target must be an existing directory: ${requested}`, 2, 'error'); }
  const source = await realpath(packageRoot), relative = path.relative(source, root);
  if(!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new AerError('refusing installation in package/source checkout');
  return root;
}
export async function lockSnapshot(root) { return snapshot(root, RUN_LOCK, requiredThreshold(THRESHOLDS,'RUN_LOCK_MAX_BYTES')); }
export async function controlTemporaries(root) {
  return (await readdir(root)).filter(p=>/^aer\.lock\.json\.aer-[a-f0-9-]{36}\.tmp$/.test(p)).sort();
}
export async function acquire(root, hooks = {}) {
  const owner = { schemaVersion:1, pid:process.pid, hostname:hostname(), nonce:randomUUID(), createdAt:new Date().toISOString() };
  let h;
  try { h = await open(resolvePath(root, RUN_LOCK), 'wx', 0o600); }
  catch(e) { if(e.code === 'EEXIST') throw new AerError(`${RUN_LOCK} exists; inspect owner and confirm no mutator is running before manual removal`, 3); throw e; }
  try { await hooks.lockCreated?.(); await h.writeFile(JSON.stringify(owner)+'\n'); await h.sync(); }
  finally { await h.close(); }
  const expected = await lockSnapshot(root);
  if(!expected || JSON.parse(utf8(expected.bytes,RUN_LOCK)).nonce !== owner.nonce) throw new AerError('run lock replaced during acquisition',4,'interrupted');
  return { owner, expected };
}
export async function assertLock(root, lease) { await guard(root, RUN_LOCK, lease.expected); }
export async function release(root, lease) { await assertLock(root, lease); await unlink(resolvePath(root,RUN_LOCK)); }
export async function prune(root, files) {
  const dirs = new Set(files.flatMap(f => { const a=f.split('/');a.pop();return a.map((_,i)=>a.slice(0,i+1).join('/')); }));
  for(const dir of [...dirs].sort((a,b)=>b.length-a.length)) {
    await parents(root,`${dir}/placeholder`);
    try { await rmdir(resolvePath(root,dir)); } catch(e) { if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code)) throw e; }
  }
}
