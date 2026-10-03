import { readFile, lstat, realpath } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, readPackage, closed } from '../src/payload.mjs';
import { safePath } from '../src/fs-safe.mjs';

export function routingErrors(doc,catalog) {
 const errors=[],known=new Set(catalog.map(s=>s.name)),manual=new Set(catalog.filter(s=>s.manualOnly).map(s=>s.name)),ids=new Set();
 if(doc.schemaVersion!==1 || [...known].sort().join()!==[...doc.catalog].sort().join())errors.push('competing catalog mismatch');
 for(const c of doc.cases??[]) {
  try {closed(c,['id','prompt','explicitInvocation','primary','supporting','forbidden'],'routing case');}catch(e){errors.push(e.message);continue;}
  if(ids.has(c.id)||!c.prompt.trim())errors.push('duplicate/empty routing case');ids.add(c.id);
  const listed=[...c.primary,...c.supporting,...c.forbidden];
  if(new Set(listed).size!==listed.length||listed.some(n=>!known.has(n)))errors.push(`${c.id}: conflicting/unknown routing sets`);
  if(c.explicitInvocation!==null&&!known.has(c.explicitInvocation))errors.push(`${c.id}: unknown explicit route`);
  if([...c.primary,...c.supporting].some(n=>manual.has(n)&&n!==c.explicitInvocation))errors.push(`${c.id}: bypasses manual-only invocation`);
 }
 return errors;
}
export async function validateEvals({executeFixtures=true}={}) {
 const pkg=await readPackage();const json=async p=>JSON.parse(await readFile(path.join(ROOT,p),'utf8'));
 const routing=await json('evals/routing/catalog-cases.json'),behavior=await json('evals/behavior/cases.json'),rubric=await json('evals/behavior/rubric.json'),index=await json('evals/behavior/study-index.json');
 const errors=routingErrors(routing,pkg.clients.skills),fixtures=new Set(),ids=new Set();
 if(behavior.schemaVersion!==1||behavior.status!=='prepared-not-executed-model-trials'||rubric.schemaVersion!==1||!rubric.frozenBeforeComparison||index.schemaVersion!==1||index.comparisons.length!==4)errors.push('invalid evaluation design contract');
 for(const c of behavior.cases) {
  if(ids.has(c.id)||!pkg.skills.has(c.skill)||!c.setup||!c.cleanup||!c.requirementsDisclosed)errors.push(`invalid behavior case ${c.id}`);ids.add(c.id);
  for(const p of [c.fixture,c.prompt,c.rubric]) {
   try {safePath(p);const stat=await lstat(path.join(ROOT,p));if(stat.isSymbolicLink())throw Error('symlink');}
   catch(e){errors.push(`${c.id}: invalid fixture resource ${p}: ${e.message}`);}
  }
  if(JSON.stringify(c.baselineCommand)!==JSON.stringify(['node','--test','baseline.test.mjs']))errors.push(`${c.id}: unsupported fixture setup command`);
  fixtures.add(c.fixture);
 }
 if(executeFixtures)for(const dir of fixtures) {
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const r=spawnSync(process.execPath,['--test','baseline.test.mjs'],{cwd:path.join(ROOT,dir),env,encoding:'utf8',timeout:10000,windowsHide:true});
  if(r.status!==0||!r.stdout.includes('pass 1'))errors.push(`${dir}: baseline not runnable: ${r.stderr??r.error??r.stdout}`);
 }
 return {errors,routingCases:routing.cases.length,behaviorCases:behavior.cases.length,fixtureBaselines:fixtures.size,modelTrials:0};
}
if(process.argv[1]?.endsWith('validate-evals.mjs'))validateEvals().then(r=>{console.log(JSON.stringify(r));if(r.errors.length)process.exitCode=1;}).catch(e=>{console.error(e.message);process.exitCode=1;});
