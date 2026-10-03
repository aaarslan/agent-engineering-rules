import { AerError, STATE, snapshot, lockSnapshot, sameSnapshot, targetRoot, ownedHash,controlTemporaries } from './fs-safe.mjs';
import { readPackage, expectedFiles, estimates, kernelBody } from './payload.mjs';
import { loadState } from './state.mjs';
import { detectV5, extraFiles } from './plan.mjs';
import { findBlock, compose } from './block.mjs';

export async function check(options={},hooks={}) {
  const pkg=await readPackage(options.packageRoot),root=await targetRoot(options.target??process.cwd(),pkg.root);
  const base={schemaVersion:1,command:'check',status:'not-installed',exitCode:1,runningPackage:{version:pkg.pkg.version,sourceIdentity:pkg.sourceIdentity},installedPackage:null,packageMatch:null,plannedChanges:[],committedChanges:[],retained:[],conflicts:[],notes:[],contextEstimates:null,pendingOperation:null};
  let lock;
  try {lock=await lockSnapshot(root);}catch(e){return {...base,status:'invalid',exitCode:4,conflicts:[e.message]};}
  if(lock) return {...base,status:'active-install',notes:['Run lock present; may be active or stale. Inspect owner before manual recovery.']};
  const temporaries=await controlTemporaries(root);
  if(temporaries.length)return {...base,status:'interrupted',notes:temporaries.map(p=>`Journal temporary ${p}; inspect ledger and back up unowned remnants before manual recovery.`)};
  let loaded;
  try {
    loaded=await loadState(root,pkg);await detectV5(root);
    if(loaded.state?.status==='pending') {
      base.status='interrupted';base.pendingOperation=loaded.state.operation;
      base.notes.push('Resume the recorded operation with the creating package.');
    } else if(loaded.state) {
    const s=loaded.state;
    base.installedPackage=s.package;base.packageMatch=s.package.sourceIdentity===pkg.sourceIdentity;
    const issues=[];
    for(const [p,f] of Object.entries(s.files)) {
      try { const actual=await snapshot(root,p); if(!actual || ownedHash(actual.bytes,f.normalization)!==f.sha256) issues.push(`${p}: missing or modified`); }
      catch(e) { issues.push(e.message); }
    }
    try { if(findBlock((await snapshot(root,s.block.path))?.bytes??null,s.block.path)?.hash!==s.block.sha256) issues.push(`${s.block.path}: missing or modified block`); }
    catch(e) { issues.push(e.message); }
    issues.push(...(await extraFiles(root,[s])).map(p=>`${p}: unexpected file`));
    if(!base.packageMatch) issues.push('installed source inventory differs from locally running package; packageMatch is consistency, not authentication');
    base.conflicts=issues;base.status=issues.length?'drift':'current';base.exitCode=issues.length?1:0;
    base.contextEstimates=estimates(pkg,s.selection,expectedFiles(pkg,s.selection),compose(kernelBody(pkg,s.selection)));
    if(s.selection.destinations.some(d=>d.representation==='claude-code') && s.block.path==='AGENTS.md' && await snapshot(root,'CLAUDE.md')) base.notes.push('Claude Code may prefer CLAUDE.md over AGENTS.md (documentation reviewed 2026-10-02); inspect /context and an explicit @AGENTS.md import bridge.');
    }
  } catch(e) {
    if(e.status==='unstable-snapshot') return {...base,status:'unstable-snapshot'};
    return {...base,status:'invalid',exitCode:4,conflicts:[e.message]};
  }
  await hooks.beforeFinalSnapshot?.();
  try {
    if(await lockSnapshot(root)) return {...base,status:'active-install',exitCode:1};
    if(!sameSnapshot(loaded.snapshot,await snapshot(root,STATE))) return {...base,status:'unstable-snapshot',exitCode:1};
  } catch(e) {
    if(e.status==='unstable-snapshot') return {...base,status:'unstable-snapshot',exitCode:1};
    return {...base,status:'invalid',exitCode:4,conflicts:[e.message]};
  }
  return base;
}
