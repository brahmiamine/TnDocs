import test from 'node:test';import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {createDocumentSchema,documentContentSchema} from '../src/modules/documents/schema';
import {createPinnedDocumentContent,assertSecondarySnapshotChange} from '../src/modules/documents/bilingual';
import {documentHtml} from '../src/modules/documents/pdf-renderer';
import {renderDocumentDocx} from '../src/modules/documents/docx-renderer';
import {formSchema} from '../src/modules/documents/form-schema';
const schema=formSchema.parse({schemaVersion:1,fields:[{key:'name',kind:'text',label:{fr:'Nom fictif',ar:'اسم خيالي'},required:true}]});
const translations=[{locale:'fr' as const,title:'Exemple fictif français',body:'Bonjour {{name}} BODYFR123'},{locale:'ar' as const,title:'مثال خيالي عربي',body:'مرحبا {{name}} BODYAR456'}];
test('bilingual drafts require both existing pinned translations and the shared declared field mapping',()=>{
 const result=createPinnedDocumentContent('fr',translations,true,schema);assert.equal(result.locale,'fr');assert.equal(result.secondary!.locale,'ar');assert.equal(result.secondary!.body,translations[1].body);
 const reversed=createPinnedDocumentContent('ar',translations,true,schema);assert.equal(reversed.secondary!.locale,'fr');
 assert.throws(()=>createPinnedDocumentContent('fr',translations.slice(0,1),true,schema),/LOCALE_UNAVAILABLE/);
 assert.throws(()=>createPinnedDocumentContent('fr',[translations[0],{...translations[1],body:'{{undeclared}}'}],true,schema),/TEMPLATE_SCHEMA_INVALID/);
 assert.equal(createPinnedDocumentContent('fr',translations,false,schema).secondary,undefined);
});
test('schema accepts explicit bilingual creation and rejects duplicate-language secondary snapshots',()=>{
 assert.equal(createDocumentSchema.safeParse({templateId:'861a34e0-e767-4119-8f6b-968a7087139d',locale:'fr',bilingual:true}).success,true);
 assert.equal(createDocumentSchema.safeParse({templateId:'861a34e0-e767-4119-8f6b-968a7087139d',locale:'fr',bilingual:'yes'}).success,false);
 assert.equal(documentContentSchema.safeParse({locale:'fr',body:'A',answers:{},secondary:{locale:'fr',body:'B'}}).success,false);
});
test('editing cannot silently add, remove or swap the pinned secondary language',()=>{
 const content=createPinnedDocumentContent('fr',translations,true,schema);
 assert.doesNotThrow(()=>assertSecondarySnapshotChange(content,{...content,secondary:{...content.secondary!,body:'Révision arabe éditée'}},true));
 assert.throws(()=>assertSecondarySnapshotChange(content,{...content,secondary:undefined},true),/BILINGUAL_SNAPSHOT_CHANGED/);
 assert.throws(()=>assertSecondarySnapshotChange({...content,secondary:undefined},content,true),/BILINGUAL_SNAPSHOT_CHANGED/);
 assert.throws(()=>assertSecondarySnapshotChange(content,{...content,secondary:{...content.secondary!,body:'changed'}},false),/READ_ONLY_CONTENT/);
});
test('HTML and DOCX render both scripts using common answers and separate LTR/RTL sections',async()=>{
 const content=createPinnedDocumentContent('fr',translations,true,schema);const answers={name:'Personne fictive'};
 const html=documentHtml(content.title!,'Bonjour Personne fictive BODYFR123','fr',undefined,answers,content.secondary);
 assert.ok(html.includes('lang="fr" dir="ltr"'));assert.ok(html.includes('lang="ar" dir="rtl"'));assert.ok(html.includes('مرحبا Personne fictive BODYAR456'));assert.ok(!html.includes('{{name}}'));
 const xml=strFromU8(unzipSync(await renderDocumentDocx(content.title!,'Bonjour Personne fictive BODYFR123','fr',undefined,answers,content.secondary))['word/document.xml']);
 for(const text of ['BODYFR123','BODYAR456','مرحبا Personne fictive','w:rtl','w:bidi'])assert.ok(xml.includes(text),text);
 assert.ok(!xml.includes('{{name}}'));
});
