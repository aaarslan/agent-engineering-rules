import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile, cp, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT, readPackage, historyRecord } from '../src/payload.mjs';
import { install,uninstall } from '../src/install.mjs';
import { check } from '../src/check.mjs';
import { schemaErrors } from '../tools/schema.mjs';
const cli=path.join(ROOT,'src/cli.mjs');
async function temp(t){const d=await realpath(await mkdtemp(path.join(tmpdir(),'aer-cli-test-')));t.after(()=>rm(d,{recursive:true,force:true}));return d;}
function run(args){return spawnSync(process.execPath,[cli,...args],{encoding:'utf8',windowsHide:true});}
test('three commands, strict options and one versioned JSON object for every exit family',async t=>{
 const target=await temp(t);const schema=JSON.parse(await readFile(path.join(ROOT,'schemas/output.schema.json'),'utf8'));
 for(const [args,code,status] of [[['install','--target',target,'--skills','none','--json'],0,'current'],[['check','--target',target,'--json'],0,'current'],[['init','--json'],2,'error'],[['install','--target',target,'--profile','standard','--profile','prototype','--json'],2,'error']]) {
  const r=run(args);assert.equal(r.status,code,r.stderr+r.stdout);const o=JSON.parse(r.stdout);assert.equal(o.status,status);assert.deepEqual(schemaErrors(o,schema),[]);
 }
 await writeFile(path.join(target,'AGENTS.md'),'drift');let r=run(['install','--target',target,'--json']);assert.equal(r.status,3);assert.equal(JSON.parse(r.stdout).status,'refused');
 await writeFile(path.join(target,'aer.lock.json'),'{}');r=run(['check','--target',target,'--json']);assert.equal(r.status,4);assert.equal(JSON.parse(r.stdout).status,'invalid');
 const absent=await temp(t);r=run(['check','--target',absent,'--json']);assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).status,'not-installed');
 assert.equal(run(['--version']).stdout.trim(),'6.0.1');assert.match(run(['--help']).stdout,/explicit representation|destination/);
});
test('recognized package upgrades/downgrades use package-supplied prior inventories; unsupported identities refuse',async t=>{
 const oldRoot=await temp(t),newRoot=await temp(t);
 for(const root of [oldRoot,newRoot])for(const p of ['package.json','kernel','skills','integrations','src','schemas'])await cp(path.join(ROOT,p),path.join(root,p),{recursive:true});
 const newKernel=path.join(newRoot,'kernel/contract.md');await writeFile(newKernel,(await readFile(newKernel,'utf8'))+'\nNew version fixture: preserve consumer contracts.\n');
 const packageFile=path.join(newRoot,'package.json'),p=JSON.parse(await readFile(packageFile,'utf8'));p.version='6.1.0';await writeFile(packageFile,JSON.stringify(p));
 const oldPkg=await readPackage(oldRoot,{inventory:false}),newPkg=await readPackage(newRoot,{inventory:false});
 for(const [root,prior] of [[oldRoot,newPkg],[newRoot,oldPkg]]) {
  await writeFile(path.join(root,'integrations/payload-history.json'),JSON.stringify({schemaVersion:1,payloads:[historyRecord(prior)]},null,2)+'\n');
  const pkg=await readPackage(root,{inventory:false});await writeFile(path.join(root,'payload-manifest.json'),JSON.stringify(pkg.manifest,null,2)+'\n');
 }
 const target=await temp(t);await install({target,packageRoot:oldRoot,skills:'none'});
 await install({target,packageRoot:newRoot});assert.equal((await check({target,packageRoot:newRoot})).status,'current');
 await install({target,packageRoot:oldRoot});assert.equal((await check({target,packageRoot:oldRoot})).status,'current');
 const s=JSON.parse(await readFile(path.join(target,'aer.lock.json'),'utf8'));s.package.sourceIdentity='0'.repeat(64);await writeFile(path.join(target,'aer.lock.json'),JSON.stringify(s));
 await assert.rejects(uninstall({target,packageRoot:oldRoot}),e=>e.exitCode===4);assert.equal((await check({target,packageRoot:oldRoot})).status,'invalid');
});

test('prior payload reference retirement refuses edits and preserves consumer files in every representation', async (t) => {
  const oldRoot = await temp(t);
  const newRoot = await temp(t);
  for (const root of [oldRoot, newRoot]) {
    for (const resource of ['package.json', 'kernel', 'skills', 'integrations', 'src', 'schemas']) {
      await cp(path.join(ROOT, resource), path.join(root, resource), { recursive: true });
    }
  }
  const obsolete = 'aer-implementing-features/references/retired.md';
  await writeFile(path.join(oldRoot, 'skills', obsolete), 'Prior owned reference.\n');
  const oldPackage = await readPackage(oldRoot, { inventory: false });
  await writeFile(path.join(oldRoot, 'payload-manifest.json'), JSON.stringify(oldPackage.manifest, null, 2) + '\n');
  const historyFile = path.join(newRoot, 'integrations/payload-history.json');
  const history = JSON.parse(await readFile(historyFile, 'utf8'));
  history.payloads.push(historyRecord(oldPackage));
  await writeFile(historyFile, JSON.stringify(history, null, 2) + '\n');
  const newPackage = await readPackage(newRoot, { inventory: false });
  await writeFile(path.join(newRoot, 'payload-manifest.json'), JSON.stringify(newPackage.manifest, null, 2) + '\n');
  for (const representation of ['portable', 'codex', 'claude-code']) {
    const target = await temp(t);
    const consumerText = '\uFEFFconsumer\r\nno final newline';
    await writeFile(path.join(target, 'AGENTS.md'), consumerText);
    const options = { target, skills: ['aer-implementing-features', 'aer-reviewing-changes'], destinations: [{ representation, path: 'installed-skills' }] };
    await install({ ...options, packageRoot: oldRoot });
    const retiredPath = path.join(target, 'installed-skills', obsolete);
    await writeFile(retiredPath, 'Consumer changed this reference.\n');
    await assert.rejects(install({ target, packageRoot: newRoot }), (error) => error.exitCode === 3);
    assert.equal(await readFile(retiredPath, 'utf8'), 'Consumer changed this reference.\n');
    const stateBefore = await readFile(path.join(target, 'aer.lock.json'));
    await writeFile(retiredPath, 'Prior owned reference.\n');
    await writeFile(path.join(target, 'installed-skills', 'consumer.md'), 'Keep this file.\n');
    const preview = await install({ target, packageRoot: newRoot, dryRun: true });
    assert.ok(preview.plannedChanges.some((change) => change.path.endsWith(obsolete)));
    assert.deepEqual(await readFile(path.join(target, 'aer.lock.json')), stateBefore);
    await install({ target, packageRoot: newRoot });
    await assert.rejects(readFile(retiredPath), { code: 'ENOENT' });
    assert.equal((await check({ target, packageRoot: newRoot })).status, 'current');
    await uninstall({ target, packageRoot: newRoot });
    assert.equal(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), consumerText);
    assert.equal(await readFile(path.join(target, 'installed-skills', 'consumer.md'), 'utf8'), 'Keep this file.\n');
  }
});
