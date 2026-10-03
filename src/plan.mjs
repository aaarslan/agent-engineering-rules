import { AerError, snapshot, ownedHash, walk } from './fs-safe.mjs';
import { findBlock, insert, change, remove, compose } from './block.mjs';
import { expectedFiles, kernelBody, selection, estimates } from './payload.mjs';
import { stable } from './state.mjs';
import { requiredThreshold } from './thresholds.mjs';

export async function detectV5(root, instructions = []) {
  if(await snapshot(root,'.agent-engineering-rules-state.json')) throw new AerError('v5 state detected; preview/back up and uninstall with @aaarslan/aer@5.0.0; see INSTALL.md');
  for(const p of new Set(['AGENTS.md','CLAUDE.md','.claude/CLAUDE.md',...instructions])) {
    const s=await snapshot(root,p);
    if(s?.bytes.includes(Buffer.from('<!-- agent-engineering-rules:'))) throw new AerError(`v5 managed marker detected in ${p}; use the pinned v5 exit walkthrough`);
  }
}
export async function extraFiles(root, states) {
  const owned=new Set(states.flatMap(s=>Object.keys(s?.files??{}))), dirs=new Set();
  for(const s of states) if(s) for(const d of s.selection.destinations) for(const n of s.selection.skills) dirs.add(`${d.path}/${n}`);
  const extras=[];
  for(const dir of dirs) {
    try { for(const file of await walk(root,dir)) if(!owned.has(file)) extras.push(file); }
    catch(e) { if(e.code!=='ENOENT') throw e; }
  }
  return [...new Set(extras)].sort();
}
export async function buildPlan(root,pkg,original,options,kind) {
  const selected=kind==='install'?selection(options,original?.selection,pkg):null;
  const files=selected?expectedFiles(pkg,selected):new Map();
  let desired=null;
  if(selected) {
    const body=kernelBody(pkg,selected), p=selected.instructionsFile, s=await snapshot(root,p), b=findBlock(s?.bytes??null,p);
    let ownership;
    if(original?.block.path===p) ownership=original.block.ownership;
    else { if(b) throw new AerError(`unowned managed block: ${p}`); ownership=insert(s?.bytes??null,body).ownership; }
    const rendered=compose(body);
    const cost=estimates(pkg,selected,files,rendered);
    if(cost.blockBytes>requiredThreshold(pkg.thresholds,'COMPOSED_BLOCK_MAX_BYTES')) throw new AerError('composed block exceeds configured budget',4,'invalid');
    desired=stable(pkg,selected,files,{path:p,sha256:ownedHash(Buffer.from(rendered)),ownership});
  }
  const paths=[...new Set([...Object.keys(original?.files??{}),...files.keys(),original?.block.path,desired?.block.path].filter(Boolean))].sort();
  for(const p of paths) {
    const file=Object.hasOwn(original?.files??{},p)||files.has(p), block=original?.block.path===p || desired?.block.path===p;
    if(file&&block) throw new AerError(`move changes file/block role: ${p}`);
  }
  const operations=paths.map(p=>{
    const type=original?.block.path===p || desired?.block.path===p?'block':'file';
    return {path:p,type,before:type==='file'?original?.files[p]?.sha256??null:original?.block.path===p?original.block.sha256:null,after:type==='file'?desired?.files[p]?.sha256??null:desired?.block.path===p?desired.block.sha256:null};
  });
  const op={original,desired,operations,kind,retained:[],keepModified:options.keepModified??false};
  const prepared=await prepare(root,pkg,op,false,options.keepModified??false);
  op.retained=prepared.retained;
  op.operations=operations.filter(a=>!op.retained.includes(a.path));
  return {op,prepared};
}
export async function prepare(root,pkg,op,resuming=false,keepModified=false) {
  const files=op.desired?expectedFiles(pkg,op.desired.selection):new Map();
  const body=op.desired?kernelBody(pkg,op.desired.selection):null;
  const changes=[],retained=[...op.retained], conflicts=[];
  const extras=await extraFiles(root,[op.original,op.desired]);
  if(extras.length) {
    if(op.kind==='uninstall' && keepModified) retained.push(...extras);
    else conflicts.push(...extras.map(p=>`${p}: unexpected file inside managed skill`));
  }
  for(const action of op.operations) {
    const p=action.path, s=await snapshot(root,p), bytes=s?.bytes??null;
    try {
      let actual,after;
      if(action.type==='file') {
        const entry=files.get(p)??op.original.files[p];
        actual=bytes===null?null:ownedHash(bytes,entry.normalization);
        if(actual===action.before || (resuming && actual===action.after)) {
          after=action.after===null?null:actual===action.after?bytes:files.get(p).bytes;
        } else throw new AerError(`${p}: ${action.before===null?'unowned collision':'modified or missing owned file'}`);
        // Matching bytes in an unowned existing file never grant ownership.
        if(action.before===null && bytes!==null && !resuming) throw new AerError(`${p}: unowned collision`);
      } else {
        const b=findBlock(bytes,p); actual=b?.hash??null;
        if(actual!==action.before && !(resuming&&actual===action.after)) throw new AerError(`${p}: modified or missing owned block`);
        if(action.before===null && b && !resuming) throw new AerError(`${p}: unowned managed block`);
        if(action.after===null) after=b?remove(bytes,op.original.block.ownership):bytes;
        else if(b) after=actual===action.after?bytes:change(bytes,body,op.desired.block.ownership);
        else after=insert(bytes,body).bytes;
      }
      if((bytes===null)!==(after===null) || (bytes!==null&&after!==null&&!bytes.equals(after))) changes.push({path:p,type:action.type,action:after===null?'delete':bytes===null?'create':'update',snapshot:s,bytes:after});
    } catch(e) {
      if(op.kind==='uninstall' && keepModified && e instanceof AerError && e.exitCode===3) retained.push(p);
      else conflicts.push(e.message);
    }
  }
  if(conflicts.length) throw new AerError(conflicts.join('\n'),resuming?4:3,resuming?'interrupted':'refused',{conflicts});
  return {changes,retained:[...new Set(retained)].sort()};
}
