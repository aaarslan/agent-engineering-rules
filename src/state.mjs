import { AerError, STATE, snapshot, utf8, safePath, ownedHash, hash, uniqueJson } from './fs-safe.mjs';
import { closed, selection, expectedFiles, kernelBody, recognizedInventory } from './payload.mjs';
import { compose } from './block.mjs';
import { requiredThreshold } from './thresholds.mjs';

const HASH=/^[a-f0-9]{64}$/;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export const jsonBytes = v => Buffer.from(JSON.stringify(v,null,2)+'\n');
export function inventory(files) {
  return Object.fromEntries([...files].sort(([a],[b])=>a.localeCompare(b)).map(([p,f])=>[p,{sha256:f.sha256,normalization:f.normalization,representation:f.representation,renderer:f.renderer}]));
}
export function packageIdentity(pkg, files) { return {version:pkg.pkg.version,sourceIdentity:pkg.sourceIdentity,representationIdentity:hash(JSON.stringify(inventory(files)))}; }
export function stable(pkg, selected, files, block) {
  return {schemaVersion:1,status:'stable',package:packageIdentity(pkg,files),selection:selected,files:inventory(files),block};
}
export function validateStable(value,pkg) {
  closed(value,['schemaVersion','status','package','selection','files','block'],'stable state');
  if(value.schemaVersion!==1 || value.status!=='stable') throw new AerError('unsupported state version/status',4,'invalid');
  closed(value.package,['version','sourceIdentity','representationIdentity'],'package identity');
  if(typeof value.package.version!=='string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(value.package.version) || !HASH.test(value.package.sourceIdentity) || !HASH.test(value.package.representationIdentity)) throw new AerError('invalid package identity',4,'invalid');
  closed(value.selection,['profile','instructionsFile','skills','destinations'],'selection');
  const canonical=selection(value.selection,null,pkg);
  if(!equal(canonical,value.selection)) throw new AerError('noncanonical state selection',4,'invalid');
  const expected=recognizedInventory(pkg,canonical,value.package.sourceIdentity);
  if(!value.files || typeof value.files!=='object' || Array.isArray(value.files) || Object.keys(value.files).length>requiredThreshold(pkg.thresholds,'INVENTORY_MAX_COUNT') || Object.keys(value.files).sort().join('\n')!==[...expected.keys()].sort().join('\n')) throw new AerError('incomplete or unrecognized state inventory; unknown prior inventories require explicit recovery',4,'invalid');
  for(const [p,f] of Object.entries(value.files)) {
    safePath(p);closed(f,['sha256','normalization','representation','renderer'],p);
    const e=expected.get(p);
    if(!HASH.test(f.sha256) || f.normalization!==e.normalization || f.representation!==e.representation || f.renderer!==e.renderer) throw new AerError(`invalid inventory entry: ${p}`,4,'invalid');
    if(f.sha256!==e.sha256) throw new AerError(`state disagrees with recognized package: ${p}`,4,'invalid');
  }
  if(value.package.representationIdentity!==hash(JSON.stringify(value.files))) throw new AerError('representation inventory identity disagrees',4,'invalid');
  closed(value.block,['path','sha256','ownership'],'block');
  closed(value.block.ownership,['createdFile','separator','tail'],'block ownership');
  const o=value.block.ownership;
  if(value.block.path!==canonical.instructionsFile || !HASH.test(value.block.sha256) || typeof o.createdFile!=='boolean' || !['','\n','\r\n'].includes(o.separator) || !['','\n','\r\n'].includes(o.tail) || (o.createdFile && o.separator)) throw new AerError('invalid block ownership',4,'invalid');
  if(value.package.sourceIdentity===pkg.sourceIdentity && value.block.sha256!==ownedHash(Buffer.from(compose(kernelBody(pkg,canonical))))) throw new AerError('block inventory disagrees with recognized package',4,'invalid');
  if(value.package.sourceIdentity!==pkg.sourceIdentity&&value.block.sha256!==pkg.history.payloads.find(h=>h.sourceIdentity===value.package.sourceIdentity)?.blockHashes[canonical.profile])throw new AerError('unknown prior block ownership',4,'invalid');
  return value;
}
export async function loadState(root,pkg) {
  let snap;
  try {snap=await snapshot(root,STATE,requiredThreshold(pkg.thresholds,'STATE_MAX_BYTES'));}
  catch(e) {throw new AerError(`${STATE}: ${e.message}`,4,'invalid');}
  if(!snap) return {state:null,snapshot:null};
  let state;
  try { state=uniqueJson(utf8(snap.bytes,STATE),STATE); } catch(e) { throw new AerError(`${STATE}: invalid JSON/encoding: ${e.message}`,4,'invalid'); }
  if(state.status==='stable') validateStable(state,pkg);
  else {
    closed(state,['schemaVersion','status','operation'],'pending state');
    if(state.schemaVersion!==1 || state.status!=='pending') throw new AerError('invalid pending status',4,'invalid');
    const op=state.operation;
    closed(op,['id','kind','original','desired','operations','retained','keepModified'],'pending operation');
    if(typeof op.keepModified!=='boolean'||(op.kind==='install'&&op.keepModified))throw new AerError('invalid pending retention mode',4,'invalid');
    if(!/^[a-f0-9-]{36}$/.test(op.id) || !['install','uninstall'].includes(op.kind) || !Array.isArray(op.operations) || op.operations.length>requiredThreshold(pkg.thresholds,'INVENTORY_MAX_COUNT') || !Array.isArray(op.retained)) throw new AerError('invalid pending operation',4,'invalid');
    if(op.original) validateStable(op.original,pkg);
    if(op.desired) validateStable(op.desired,pkg);
    if((op.kind==='install' && !op.desired) || (op.kind==='uninstall' && (op.desired!==null || !op.original))) throw new AerError('inconsistent pending operation',4,'invalid');
    const allowed=new Set([...Object.keys(op.original?.files??{}),...Object.keys(op.desired?.files??{}),op.original?.block.path,op.desired?.block.path].filter(Boolean));
    const seen=new Set();
    for(const a of op.operations) {
      closed(a,['path','type','before','after','beforeBytes','afterBytes'],'operation');safePath(a.path);
      if(!allowed.has(a.path) || seen.has(a.path) || !['file','block'].includes(a.type) || ![a.before,a.after,a.beforeBytes,a.afterBytes].every(h=>h===null || HASH.test(h))) throw new AerError('unrecognized pending mutation',4,'invalid');
      seen.add(a.path);
      const b=a.type==='file'?op.original?.files[a.path]?.sha256:op.original?.block.path===a.path?op.original.block.sha256:null;
      const d=a.type==='file'?op.desired?.files[a.path]?.sha256:op.desired?.block.path===a.path?op.desired.block.sha256:null;
      if(a.before!==(b??null) || a.after!==(d??null)) throw new AerError('pending hashes disagree with recognized selections',4,'invalid');
    }
    const expected=new Set([...allowed].filter(p=>!op.retained.includes(p)));
    const detachedExtra=p=>typeof p==='string' && op.original?.selection.destinations.some(d=>op.original.selection.skills.some(n=>p.startsWith(`${d.path}/${n}/`)));
    if([...expected].sort().join('\n')!==[...seen].sort().join('\n') || op.retained.some(p=>!allowed.has(p)&&!detachedExtra(p)) || new Set(op.retained).size!==op.retained.length || (op.kind==='install' && op.retained.length)) throw new AerError('incomplete pending inventory',4,'invalid');
    op.retained.forEach(safePath);
  }
  return {state,snapshot:snap};
}
export function fileMatches(bytes,f) { return bytes!==null && ownedHash(bytes,f.normalization)===f.sha256; }
