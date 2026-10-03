// Offline validation for the JSON Schema subset used by AER's published schemas.
// Not a general JSON Schema implementation.
export function schemaErrors(value,schema,root=schema,at='$') {
 const errors=[];const fail=m=>errors.push(`${at}: ${m}`);
 if(schema.$ref) {const keys=schema.$ref.replace(/^#\//,'').split('/');const s=keys.reduce((v,k)=>v[k],root);return schemaErrors(value,s,root,at);}
 if(schema.anyOf && !schema.anyOf.some(s=>!schemaErrors(value,s,root,at).length))fail('no anyOf variant');
 if(schema.oneOf && schema.oneOf.filter(s=>!schemaErrors(value,s,root,at).length).length!==1)fail('expected one variant');
 if(Object.hasOwn(schema,'const')&&JSON.stringify(value)!==JSON.stringify(schema.const))fail('constant mismatch');
 if(schema.enum&&!schema.enum.some(v=>JSON.stringify(v)===JSON.stringify(value)))fail('enum mismatch');
 if(schema.type) {
  const actual=value===null?'null':Array.isArray(value)?'array':typeof value;
  if(schema.type==='integer'?!Number.isSafeInteger(value):schema.type!==actual) {fail(`expected ${schema.type}`);return errors;}
 }
 if(typeof value==='string') {if(schema.minLength&&value.length<schema.minLength)fail('too short');if(schema.pattern&&!new RegExp(schema.pattern).test(value))fail('pattern mismatch');}
 if(typeof value==='number'&&schema.minimum!==undefined&&value<schema.minimum)fail('below minimum');
 if(Array.isArray(value)) {if(schema.uniqueItems&&new Set(value.map(v=>JSON.stringify(v))).size!==value.length)fail('duplicate array item');if(schema.items)value.forEach((v,i)=>errors.push(...schemaErrors(v,schema.items,root,`${at}[${i}]`)));}
 if(value&&typeof value==='object'&&!Array.isArray(value)) {
  if(schema.maxProperties&&Object.keys(value).length>schema.maxProperties)fail('too many properties');
  for(const k of schema.required??[])if(!Object.hasOwn(value,k))fail(`missing ${k}`);
  for(const [k,v] of Object.entries(value)) {
   const s=schema.properties?.[k];if(s)errors.push(...schemaErrors(v,s,root,`${at}.${k}`));
   else if(schema.additionalProperties===false)fail(`unexpected ${k}`);
   else if(schema.additionalProperties&&typeof schema.additionalProperties==='object')errors.push(...schemaErrors(v,schema.additionalProperties,root,`${at}.${k}`));
  }
 }
 return errors;
}
