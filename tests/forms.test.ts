import assert from 'node:assert/strict';
import test from 'node:test';
import { formSchema, resolveFormAnswers, resolveDraftFormAnswers, getFormAnswerErrors, validateFormAnswers, renderTemplateText } from '../src/modules/documents/form-schema';
const label = {fr:'Nom',ar:'الاسم'};
const field = (key:string, extra:Record<string,unknown>={}) => ({key,kind:'text',label,...extra});
test('legacy forms retain text rendering and real calendar validation',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('name',{required:true}),field('date',{kind:'date'})]});
 assert.equal(validateFormAnswers(schema,{name:'علي',date:'2024-02-29'}),true);
 assert.equal(validateFormAnswers(schema,{name:'A',date:'2025-02-29'}),false);
 assert.equal(renderTemplateText('{{name}} {{missing}}',{name:'علي'}),'علي ');
});
test('strict schema rejects unknown keys, invalid references, cycles, excessive depth and duplicate options',()=>{
 assert.equal(formSchema.safeParse({schemaVersion:1,fields:[field('name',{javascript:'alert(1)'})]}).success,false);
 assert.equal(formSchema.safeParse({schemaVersion:1,fields:[field('name',{when:{op:'eq',field:'unknown',value:'yes'}})]}).success,false);
 assert.equal(formSchema.safeParse({schemaVersion:1,fields:[field('a',{kind:'calculated',formula:{op:'add',args:[{field:'b'},{value:1}]}}),field('b',{kind:'calculated',formula:{op:'add',args:[{field:'a'},{value:1}]}})]}).success,false);
 let when:unknown={op:'eq',field:'name',value:'yes'}; for(let i=0;i<12;i++)when={op:'all',conditions:[when]};
 assert.equal(formSchema.safeParse({schemaVersion:1,fields:[field('name'),field('other',{when})]}).success,false);
 assert.equal(formSchema.safeParse({schemaVersion:1,fields:[field('choice',{kind:'radio',options:[{value:'x',label},{value:'x',label}]})]}).success,false);
});
test('conditional required fields apply only when visible and unknown answers are rejected',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('status'),field('spouse',{required:true,when:{op:'eq',field:'status',value:'married'}})]});
 assert.equal(validateFormAnswers(schema,{status:'single'}),true);
 assert.equal(validateFormAnswers(schema,{status:'married'}),false);
 assert.equal(validateFormAnswers(schema,{status:'single',hidden:'x'}),false);
 assert.equal(getFormAnswerErrors(schema,{status:'married'}).spouse,'required');
});
test('email, currency, radio and multiselect validate values without executing text',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('mail',{kind:'email'}),field('price',{kind:'currency'}),field('choices',{kind:'multiselect',options:[{value:'yes',label},{value:'no',label}]})]});
 assert.equal(validateFormAnswers(schema,{mail:'a@example.test',price:'12,50',choices:['yes']}),true);
 for(const bad of [{mail:'bad'},{price:'Infinity'},{choices:['bad']},{choices:['yes','yes']}])assert.equal(validateFormAnswers(schema,bad),false);
});
test('bounded repeated groups validate each row and render declared values safely',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('people',{kind:'repeat',minItems:1,maxItems:2,itemFields:[field('name',{required:true}),field('age',{kind:'number'})]})]});
 assert.equal(validateFormAnswers(schema,{people:[{name:'A',age:'20'},{name:'ب'}]}),true);
 assert.equal(validateFormAnswers(schema,{people:[{name:''}]}),false);
 assert.equal(validateFormAnswers(schema,{people:[{name:'A',private:'x'}]}),false);
 assert.equal(validateFormAnswers(schema,{people:[{name:'A'},{name:'B'},{name:'C'}]}),false);
 assert.equal(renderTemplateText('{{people}}',{people:[{name:'A'},{name:'ب'}]}),'A\nب');
});
test('calculations resolve dependency order, reject tampering and divide by zero',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('subtotal',{kind:'calculated',formula:{op:'multiply',args:[{field:'price'},{field:'count'}]}}),field('price',{kind:'currency'}),field('count',{kind:'number'})]});
 assert.equal(resolveFormAnswers(schema,{price:'12,5',count:'2'}).subtotal,'25');
 assert.equal(validateFormAnswers(schema,{price:'12,5',count:'2',subtotal:'100'}),false);
 assert.equal(validateFormAnswers(schema,{price:'12,5',count:'2',subtotal:'25'}),true);
 const divide=formSchema.parse({schemaVersion:1,fields:[field('ratio',{kind:'calculated',formula:{op:'divide',args:[{value:1},{value:0}]}})]});
 assert.equal(validateFormAnswers(divide,{}),false);
});
test('repeated calculated fields cannot be forged by submitting stale row totals',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('rows',{kind:'repeat',itemFields:[field('qty',{kind:'number'}),field('total',{kind:'calculated',formula:{op:'multiply',args:[{field:'qty'},{value:2}]}})]})]});
 assert.equal(validateFormAnswers(schema,{rows:[{qty:'2',total:'999'}]}),false);
 assert.equal(validateFormAnswers(schema,{rows:[{qty:'2',total:'4'}]}),true);
});
test('draft computation preserves unfinished inputs and discards failed or stale derived values',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('qty',{kind:'number',required:true}),field('total',{kind:'calculated',formula:{op:'multiply',args:[{field:'qty'},{value:2}]}})]});
 assert.deepEqual(resolveDraftFormAnswers(schema,{qty:'bad',total:'forged'}),{qty:'bad'});
 assert.deepEqual(resolveDraftFormAnswers(schema,{}),{});
 assert.deepEqual(resolveDraftFormAnswers(schema,{qty:'3'}),{qty:'3',total:'6'});
 assert.equal(validateFormAnswers(schema,{qty:'bad'}),false);
});
test('inactive conditional fields do not leak stale answers into document rendering',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('status'),field('spouse',{when:{op:'eq',field:'status',value:'married'}})]});
 const values=resolveFormAnswers(schema,{status:'single',spouse:'PRIOR PRIVATE NAME'});
 assert.equal(values.spouse,undefined);
 assert.equal(renderTemplateText('{{spouse}}',values),'');
});
test('calculation errors do not hide ordinary required-field errors',()=>{
 const schema=formSchema.parse({schemaVersion:1,fields:[field('name',{required:true}),field('qty',{kind:'number'}),field('total',{kind:'calculated',formula:{op:'multiply',args:[{field:'qty'},{value:2}]}})]});
 assert.equal(getFormAnswerErrors(schema,{}).name,'required');
});
