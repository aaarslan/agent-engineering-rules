import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../src/payload.mjs';
import { walk,hash } from '../src/fs-safe.mjs';
const scripts={contrast:path.join(ROOT,'skills/aer-building-web-ui/scripts/contrast-check.mjs'),slop:path.join(ROOT,'skills/aer-verifying-work/scripts/slop-scan.mjs'),size:path.join(ROOT,'skills/aer-verifying-work/scripts/file-size-guard.mjs')};
test('standalone diagnostic help, invalid selectors, exact contrast and no-argument size reject are read-only',async t=>{
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-diagnostic-')));t.after(()=>rm(target,{recursive:true,force:true}));
 const run=(script,args)=>spawnSync(process.execPath,[script,...args],{cwd:target,encoding:'utf8',input:'{}',windowsHide:true,timeout:10000});
 for(const script of Object.values(scripts)) {const h=run(script,['--help']);assert.equal(h.status,0,h.stderr);assert.match(h.stdout,/Unchanged retries add no evidence/);assert.equal(run(script,['--unknown']).status,2);}
 assert.equal(run(scripts.size,[]).status,2);assert.deepEqual(await walk(target),[]);
 await writeFile(path.join(target,'app.js'),'const x=1;\n');let r=run(scripts.size,['--check','app.js']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/APPLICABLE-PASS/);
 r=run(scripts.contrast,['#000','#fff']);assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/21(?:\.0+)?/);
 r=run(scripts.slop,['--file','missing.js']);assert.equal(r.status,2);assert.deepEqual(await walk(target),['app.js']);assert.equal(hash(await readFile(path.join(target,'app.js'))),hash('const x=1;\n'));
});
test('slop excludes known custom payloads, preserves authored dot-directory scope and allows explicit files',async t=>{
 const target=await realpath(await mkdtemp(path.join(tmpdir(),'aer-slop-scope-')));t.after(()=>rm(target,{recursive:true,force:true}));
 await mkdir(path.join(target,'team-skills'),{recursive:true});await mkdir(path.join(target,'.authored'),{recursive:true});
 await writeFile(path.join(target,'team-skills/payload.js'),'document.body.innerHTML = input;');
 await writeFile(path.join(target,'.authored/app.js'),'document.body.innerHTML = input;');
 await writeFile(path.join(target,'aer.lock.json'),JSON.stringify({schemaVersion:1,status:'stable',selection:{destinations:[{path:'team-skills'}]}}));
 const run=args=>spawnSync(process.execPath,[scripts.slop,...args],{cwd:target,encoding:'utf8',windowsHide:true});
 let r=run(['--root','.']);assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/\.authored\/app.js/);assert.doesNotMatch(r.stdout,/team-skills\/payload.js/);
 r=run(['--file','team-skills/payload.js']);assert.equal(r.status,1);assert.match(r.stdout,/team-skills\/payload.js/);
});
