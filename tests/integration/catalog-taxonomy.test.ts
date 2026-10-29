import {after} from 'node:test';
after(async()=>{if(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const enabled=Boolean(process.env.DATABASE_URL&&new URL(process.env.DATABASE_URL).hostname==='127.0.0.1'&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1)));
test('MariaDB taxonomy serializes duplicate slugs and parent swaps, preserves explicit translations and historical references',{skip:!enabled},async()=>{
 const {database}=await import('../../src/platform/database/client');const s=await import('../../src/platform/database/schema');const {systemAuditEvents}=await import('../../src/modules/administration/db-schema');const {eq,inArray,and}=await import('drizzle-orm');
 const {createCategory,updateCategory,createOrganization,updateOrganization,listCategories}=await import('../../src/modules/catalog/taxonomy');const {getPublicCategories}=await import('../../src/modules/catalog/public');const {createCatalogDraft,addCatalogDraftVersion}=await import('../../src/modules/catalog/admin');const {catalogDraftSchema}=await import('../../src/modules/catalog/admin-schema');
 const owner=randomUUID(),tag=randomUUID();const categoryIds:string[]=[];const organizationIds:string[]=[];let templateId:string|undefined;
 await database!.insert(s.users).values({id:owner,email:`taxonomy-${owner}@example.test`,passwordHash:'synthetic-test-hash',status:'active',role:'admin'});
 try{
  const duplicateSlug=`fixture-${tag}`;
  const races=await Promise.allSettled(Array.from({length:5},()=>createCategory(owner,{slug:duplicateSlug,translations:{fr:{name:'Catégorie fictive'}}})));
  const created=races.filter(result=>result.status==='fulfilled');assert.equal(created.length,1);categoryIds.push(created[0].value.id);
  for(const rejected of races.filter(result=>result.status==='rejected'))assert.match((rejected as PromiseRejectedResult).reason.message,/SLUG_EXISTS/);
  const category=created[0].value;
  const a=await createCategory(owner,{slug:`a-${tag}`,translations:{fr:{name:'Parent A fictif'}}});categoryIds.push(a.id);
  const b=await createCategory(owner,{slug:`b-${tag}`,translations:{fr:{name:'Parent B fictif'}}});categoryIds.push(b.id);
  const parents=await Promise.allSettled([updateCategory(owner,{id:a.id,parentId:b.id}),updateCategory(owner,{id:b.id,parentId:a.id})]);assert.equal(parents.filter(result=>result.status==='fulfilled').length,1);const rejected=parents.find(result=>result.status==='rejected') as PromiseRejectedResult;assert.match(rejected.reason.message,/CATEGORY_CYCLE/);
  await assert.rejects(updateCategory(owner,{id:category.id,translations:{fr:null}}),/TRANSLATION_REQUIRED/);
  assert.equal((await listCategories()).find(item=>item.id===category.id)!.translations.ar,null);
  const organization=await createOrganization(owner,{slug:`organization-${tag}`,officialUrl:'https://example.test/official',translations:{ar:{name:'هيئة خيالية'}}});organizationIds.push(organization.id);
  const draft=await createCatalogDraft(catalogDraftSchema.parse({documentType:'editable',organizationId:organization.id,categorySlugs:[duplicateSlug],translations:{fr:{title:'Modèle fictif de test',summary:'Uniquement une fixture locale',body:'Texte fictif sans données personnelles.'}},sources:[]}),owner);templateId=draft.templateId;
  const [linkedBefore]=await database!.select().from(s.catalogTemplateCategories).where(and(eq(s.catalogTemplateCategories.versionId,draft.versionId),eq(s.catalogTemplateCategories.categoryId,category.id)));assert.ok(linkedBefore);
  await updateCategory(owner,{id:category.id,active:false});
  const newVersionInput=catalogDraftSchema.parse({documentType:'editable',organizationId:organization.id,categorySlugs:[duplicateSlug],translations:{fr:{title:'Nouvelle version fictive',summary:'Fixture de validation',body:'Texte fictif.'}},sources:[]});
  await assert.rejects(createCatalogDraft(newVersionInput,owner),/UNKNOWN_CATEGORY/);
  await assert.rejects(addCatalogDraftVersion(draft.templateId,newVersionInput,owner),/UNKNOWN_CATEGORY/);
  assert.equal((await getPublicCategories('fr')).some(item=>item.id===category.id),false);
  const [linkedAfter]=await database!.select().from(s.catalogTemplateCategories).where(and(eq(s.catalogTemplateCategories.versionId,draft.versionId),eq(s.catalogTemplateCategories.categoryId,category.id)));assert.ok(linkedAfter);
  await updateOrganization(owner,{id:organization.id,active:false,translations:{fr:{name:'Organisme fictif'}}});
  const [template]=await database!.select().from(s.catalogTemplates).where(eq(s.catalogTemplates.id,draft.templateId));assert.equal(template.organizationId,organization.id);
  await updateCategory(owner,{id:category.id,active:true});
  await assert.rejects(createCatalogDraft(newVersionInput,owner),/UNKNOWN_ORGANIZATION/);
  await assert.rejects(addCatalogDraftVersion(draft.templateId,newVersionInput,owner),/UNKNOWN_ORGANIZATION/);
  await updateOrganization(owner,{id:organization.id,active:true});
  const newVersions=await Promise.all([addCatalogDraftVersion(draft.templateId,newVersionInput,owner),addCatalogDraftVersion(draft.templateId,newVersionInput,owner)]);assert.deepEqual(newVersions.map(item=>item.version).sort(),[2,3]);
  const audits=await database!.select().from(systemAuditEvents).where(eq(systemAuditEvents.actorUserId,owner));for(const action of ['category_created','category_updated','organization_created','organization_updated'])assert.ok(audits.some(row=>row.action===action),action);
 }finally{
  if(templateId)await database!.delete(s.catalogTemplates).where(eq(s.catalogTemplates.id,templateId));
  if(categoryIds.length)await database!.delete(s.catalogCategories).where(inArray(s.catalogCategories.id,categoryIds));if(organizationIds.length)await database!.delete(s.catalogOrganizations).where(inArray(s.catalogOrganizations.id,organizationIds));await database!.delete(systemAuditEvents).where(eq(systemAuditEvents.actorUserId,owner));await database!.delete(s.users).where(eq(s.users.id,owner));
 }
});
