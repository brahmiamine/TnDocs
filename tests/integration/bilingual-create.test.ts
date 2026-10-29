import {after} from 'node:test';
after(async()=>{if(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {unzipSync,strFromU8} from 'fflate';
const enabled=process.env.TNDOCS_HTTP_TESTS==='1'&&Boolean(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1)))&&Boolean(process.env.APP_URL&&new URL(process.env.APP_URL).hostname==='127.0.0.1');
test('HTTP bilingual creation refuses missing translation and pins both source texts and shared form answers',{skip:!enabled},async()=>{
 const {database}=await import('../../src/platform/database/client');const s=await import('../../src/platform/database/schema');const {eq}=await import('drizzle-orm');const {createSecretToken}=await import('../../src/modules/identity/tokens');
 const owner=randomUUID(),templateId=randomUUID(),versionId=randomUUID(),nextVersion=randomUUID();const secret=createSecretToken();const base=process.env.APP_URL!;
 const request=(path:string,method='GET',body?:unknown)=>fetch(`${base}${path}`,{method,headers:{Cookie:`tndocs_session=${secret.token}`,Origin:base,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const sharedSchema={schemaVersion:1,fields:[{key:'name',kind:'text',required:true,label:{fr:'Nom fictif',ar:'اسم خيالي'}}]};
 try{
  await database!.insert(s.users).values({id:owner,email:`bilingual-${owner}@example.test`,passwordHash:'synthetic-test-hash',status:'active'});
  await database!.insert(s.sessions).values({id:randomUUID(),userId:owner,tokenHash:secret.hash,expiresAt:new Date(Date.now()+3600000)});
  await database!.insert(s.catalogTemplates).values({id:templateId,documentType:'editable',status:'published',createdBy:owner,publishedVersionId:versionId});
  await database!.insert(s.catalogTemplateVersions).values({id:versionId,templateId,version:1,status:'published',createdBy:owner,formSchema:sharedSchema});
  await database!.insert(s.catalogTemplateTranslations).values({versionId,locale:'fr',title:'Exemple fictif français',summary:'Fixture',instructions:'Fictif',body:'Bonjour {{name}} BODYFR123'});
  let response=await request('/api/v1/me/documents','POST',{templateId,locale:'fr',bilingual:true});assert.equal(response.status,409,await response.clone().text());assert.equal((await response.json()).code,'LOCALE_UNAVAILABLE');
  assert.equal((await database!.select().from(s.personalDocuments).where(eq(s.personalDocuments.ownerUserId,owner))).length,0);
  await database!.insert(s.catalogTemplateTranslations).values({versionId,locale:'ar',title:'مثال خيالي عربي',summary:'اختبار',instructions:'خيالي',body:'مرحبا {{name}} BODYAR456'});
  response=await request('/api/v1/me/documents','POST',{templateId,locale:'fr',bilingual:true});assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();
  response=await request(`/api/v1/me/documents/${id}`);assert.equal(response.status,200);const {document}=await response.json();assert.equal(document.content.secondary.locale,'ar');assert.equal(document.content.secondary.body,'مرحبا {{name}} BODYAR456');
  await database!.insert(s.catalogTemplateVersions).values({id:nextVersion,templateId,version:2,status:'published',createdBy:owner,formSchema:sharedSchema});
  await database!.insert(s.catalogTemplateTranslations).values([{versionId:nextVersion,locale:'fr',title:'Nouveau texte',summary:'Fixture',instructions:'Fictif',body:'NEW FR {{name}}'},{versionId:nextVersion,locale:'ar',title:'نص جديد',summary:'اختبار',instructions:'خيالي',body:'NEW AR {{name}}'}]);
  await database!.update(s.catalogTemplates).set({publishedVersionId:nextVersion}).where(eq(s.catalogTemplates.id,templateId));
  response=await request(`/api/v1/me/documents/${id}`);const pinned=(await response.json()).document;assert.equal(pinned.content.secondary.body,'مرحبا {{name}} BODYAR456');assert.equal(pinned.formSchema.fields[0].key,'name');
  const dropped={...pinned.content,secondary:undefined};response=await request(`/api/v1/me/documents/${id}/revisions`,'POST',{expectedRevision:1,title:pinned.title,content:dropped});assert.equal(response.status,409,await response.clone().text());
  response=await request(`/api/v1/me/documents/${id}/revisions`,'POST',{expectedRevision:1,title:pinned.title,content:{...pinned.content,answers:{name:'TEST PERSON'}}});assert.equal(response.status,200,await response.clone().text());
  response=await request(`/api/v1/me/documents/${id}/exports/docx`);assert.equal(response.status,200,await response.clone().text());const xml=strFromU8(unzipSync(new Uint8Array(await response.arrayBuffer()))['word/document.xml']);assert.ok(xml.includes('Bonjour TEST PERSON BODYFR123'));assert.ok(xml.includes('مرحبا TEST PERSON BODYAR456'));assert.ok(!xml.includes('NEW AR'));
 }finally{
  await database!.delete(s.personalDocuments).where(eq(s.personalDocuments.ownerUserId,owner));await database!.delete(s.catalogTemplates).where(eq(s.catalogTemplates.id,templateId));await database!.delete(s.users).where(eq(s.users.id,owner));
 }
});
