import type {FormSchema} from './form-schema';
/** Drafts preserve unfinished input; only export/finalize enforce business completeness. */
export function validateDraftAnswers(schema:FormSchema|null,answers:Record<string,unknown>):boolean{
 if(!schema)return Object.keys(answers).length===0;
 const fields=new Map(schema.fields.map(f=>[f.key,f]));
 return Object.entries(answers).every(([key,value])=>{
  const field=fields.get(key);if(!field)return false;
  if(field.kind==='repeat')return Array.isArray(value)&&value.length<=(field.maxItems??100)&&value.every(row=>row!==null&&typeof row==='object'&&!Array.isArray(row)&&validateDraftAnswers({schemaVersion:1,fields:field.itemFields??[]},row as Record<string,unknown>));
  if(field.kind==='multiselect')return Array.isArray(value)&&value.length<=(field.options?.length??0)&&value.every(v=>typeof v==='string'&&field.options?.some(o=>o.value===v));
  if(field.kind==='checkbox')return typeof value==='boolean';
  return typeof value==='string'&&value.length<=(field.maxLength??2000);
 });
}
