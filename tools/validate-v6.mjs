import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readPackage, expectedFiles, selection, kernelBody } from '../src/payload.mjs';
import { ownedHash, safePath } from '../src/fs-safe.mjs';
import { schemaErrors } from './schema.mjs';
import { render } from './render-v6.mjs';
import { requiredThreshold } from '../src/thresholds.mjs';

export function resourceErrors(files,root) {
 const errors=[];
 for(const [name,bytes] of files) if(name.endsWith('.md')) {
  const text=bytes.toString();
  if(/\$ARGUMENTS|agent-rules\/|\{\{include/.test(text))errors.push(`${name}: hidden v5 dependency or substitution`);
  const targets=[...text.matchAll(/\]\(([^)]+)\)/g)].map(m=>m[1]);
  for(const m of text.matchAll(/`((?:references|scripts)\/[^`\s]+)`/g)) if(/\.(md|mjs|json|yaml)$/.test(m[1]))targets.push(m[1]);
  for(const target of targets) {
   if(/^(https?:|#)/.test(target))continue;
   const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(name),target.split('#')[0]));
   if((root&&!resolved.startsWith(root+'/'))||!files.has(resolved))errors.push(`${name}: missing or escaping resource ${target}`);
  }
 }
 return errors;
}
export async function validateV6() {
 await render({check:true});const pkg=await readPackage(),errors=[];
 const lock=JSON.parse(await readFile(path.join(ROOT,'package-lock.json'),'utf8')),locked=lock.packages?.[''];
 if(lock.lockfileVersion!==3||lock.name!==pkg.pkg.name||lock.version!==pkg.pkg.version||!locked||Object.keys(lock.packages).length!==1||['name','version','license','bin','engines'].some(k=>JSON.stringify(locked[k])!==JSON.stringify(pkg.pkg[k])))errors.push('package lock must match the dependency-free active package metadata');
 const schema=JSON.parse(await readFile(path.join(ROOT,'schemas/payload-manifest.schema.json'),'utf8'));
 errors.push(...schemaErrors(pkg.manifest,schema));
 const all=pkg.clients.skills.map(s=>s.name);const size=[...pkg.sources.values()].reduce((s,b)=>s+b.length,0);
 if(size>requiredThreshold(pkg.thresholds,'TOTAL_PAYLOAD_MAX_BYTES'))errors.push('total payload exceeds configured regression budget');
 const kernel=pkg.sources.get('kernel/contract.md');
 if(kernel.length>requiredThreshold(pkg.thresholds,'KERNEL_MAX_BYTES')||kernel.toString().split('\n').length>requiredThreshold(pkg.thresholds,'KERNEL_MAX_PHYSICAL_LINES'))errors.push('physical kernel budget exceeded');
 for(const name of all) {
  const root=`skills/${name}`,files=new Map([...pkg.sources].filter(([p])=>p.startsWith(root+'/')));
  errors.push(...resourceErrors(files,root));
 }
 const ui=pkg.sources.get('kernel/clauses/ui-interaction.md').toString().trimEnd();
 if(!pkg.skills.get('aer-building-web-ui').body.includes(ui)||!ui.includes('browser UI only'))errors.push('canonical browser-conditional UI clause mismatch');
 const ids=pkg.sources.get('kernel/contract.md').toString().match(/AE-\d\d/g)??[];
 if(new Set(ids).size!==26 || ids.length!==26)errors.push('kernel identifiers must occur exactly once');
 for(const representation of ['portable','codex','claude-code']) {
  const selected=selection({destinations:[{representation,path:'skills'}]},null,pkg),files=expectedFiles(pkg,selected);
  errors.push(...resourceErrors(files,''));
  for(const name of all) {
   const bytes=files.get(`skills/${name}/SKILL.md`).bytes.toString();
   if(bytes.slice(bytes.indexOf('\n---\n')+6)!==pkg.skills.get(name).body)errors.push(`${representation}:${name}: altered portable body`);
   const manual=pkg.clients.skills.find(s=>s.name===name).manualOnly;
   if(representation==='codex'&&!files.get(`skills/${name}/agents/openai.yaml`)?.bytes.toString().includes(`allow_implicit_invocation: ${!manual}`))errors.push(`bad Codex policy: ${name}`);
   if(representation==='claude-code'&&manual&&!bytes.includes('disable-model-invocation: true'))errors.push(`bad Claude policy: ${name}`);
  }
  if(Buffer.byteLength(kernelBody(pkg,selected))>requiredThreshold(pkg.thresholds,'COMPOSED_BLOCK_MAX_BYTES'))errors.push('kernel exceeds composed budget');
 }
 return {errors,metrics:{skills:all.length,files:pkg.manifest.files.length,bytes:size,sourceIdentity:pkg.sourceIdentity}};
}
if(process.argv[1]?.endsWith('validate-v6.mjs'))validateV6().then(r=>{console.log(JSON.stringify(r));if(r.errors.length)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
