import test from 'node:test';import assert from 'node:assert/strict';
import {categoryCreateSchema,categoryUpdateSchema,organizationCreateSchema,assertCategoryParent,mergeTaxonomyTranslations} from '../src/modules/catalog/taxonomy-schema';
const fr={name:'Catégorie fictive',description:'Description'};
test('taxonomy requires one explicit translation and preserves immutable slugs on updates',()=>{
 assert.equal(categoryCreateSchema.safeParse({slug:'fictive',translations:{fr}}).success,true);
 assert.equal(categoryCreateSchema.safeParse({slug:'fictive',translations:{}}).success,false);
 assert.equal(categoryCreateSchema.safeParse({slug:'Unsafe Slug',translations:{fr}}).success,false);
 assert.equal(categoryUpdateSchema.safeParse({id:'861a34e0-e767-4119-8f6b-968a7087139d',slug:'renamed'}).success,false);
 assert.deepEqual(mergeTaxonomyTranslations({fr,ar:null},{ar:{name:'صنف خيالي',description:''}}),{fr,ar:{name:'صنف خيالي',description:''}});
 assert.throws(()=>mergeTaxonomyTranslations({fr,ar:null},{fr:null}),/TRANSLATION_REQUIRED/);
 assert.deepEqual(mergeTaxonomyTranslations({fr,ar:null},{fr:undefined}),{fr,ar:null});
});
test('organization links must be HTTPS and must not contain credentials',()=>{
 for(const officialUrl of ['not-a-url','http://example.test','https://user:secret@example.test','javascript:alert(1)'])assert.equal(organizationCreateSchema.safeParse({slug:'example',translations:{fr},officialUrl}).success,false);
 assert.equal(organizationCreateSchema.safeParse({slug:'example',translations:{fr},officialUrl:'https://example.test/formulaire'}).success,true);
});
test('category parent graph rejects missing parents, direct cycles and indirect cycles',()=>{
 const graph=[{id:'a',parentId:null},{id:'b',parentId:'a'},{id:'c',parentId:'b'}];
 assert.doesNotThrow(()=>assertCategoryParent('c','a',graph));
 assert.throws(()=>assertCategoryParent('a','c',graph),/CATEGORY_CYCLE/);
 assert.throws(()=>assertCategoryParent('a','a',graph),/CATEGORY_CYCLE/);
 assert.throws(()=>assertCategoryParent('a','missing',graph),/PARENT_NOT_FOUND/);
 assert.doesNotThrow(()=>assertCategoryParent('b',null,graph));
});
