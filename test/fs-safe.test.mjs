import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,realpath,writeFile,rename,lstat,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {snapshot,guard,sameSnapshot} from '../src/fs-safe.mjs';

test('unchanged snapshots retain exact filesystem identity; equal-byte replacements refuse mutation',async t=>{
 const root=await realpath(await mkdtemp(path.join(tmpdir(),'aer-snapshot-')));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,'owned.md'),'owned bytes');
 const before=await snapshot(root,'owned.md'),metadata=await lstat(path.join(root,'owned.md'),{bigint:true});
 assert.equal(before.ino,metadata.ino.toString());assert.equal(before.birthtimeNs,metadata.birthtimeNs.toString());
 assert.ok(sameSnapshot(before,await snapshot(root,'owned.md')));await guard(root,'owned.md',before);
 await writeFile(path.join(root,'replacement.md'),'owned bytes');await rename(path.join(root,'replacement.md'),path.join(root,'owned.md'));
 await assert.rejects(guard(root,'owned.md',before),e=>e.exitCode===4);assert.equal(await readFile(path.join(root,'owned.md'),'utf8'),'owned bytes');
});
