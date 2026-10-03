import test from 'node:test';
import assert from 'node:assert/strict';
import {save,toggle,readNote,migrate} from './app.mjs';
test('sanitized fixture baseline and known authorization defect',()=>{
 const s=new Map();save(s,'private-note','draft');assert.equal(toggle(s,'private-note').archived,true);
 assert.equal(readNote(s,'unrelated-actor','private-note').value,'draft');
 assert.equal(migrate([{archived:'false'}])[0].archived,true);
});
