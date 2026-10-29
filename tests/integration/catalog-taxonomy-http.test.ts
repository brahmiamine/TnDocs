import {after} from 'node:test';
after(async()=>{if(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1))){const {database}=await import('../../src/platform/database/client');await database?.$client.end();}});
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
const enabled=process.env.TNDOCS_HTTP_TESTS==='1'&&Boolean(process.env.DATABASE_URL&&/^tndocs_verify\d+$/.test(new URL(process.env.DATABASE_URL).pathname.slice(1)))&&Boolean(process.env.APP_URL&&new URL(process.env.APP_URL).hostname==='127.0.0.1');
test('HTTP taxonomy enforces admin and CSRF and enables first catalogue draft without seeded categories',{skip:!enabled},async()=>{
 const {database}=await import('../../src/platform/database/client');const s=await import('../../src/platform/database/schema');const {systemAuditEvents}=await import('../../src/modules/administration/db-schema');const {eq,inArray}=await import('drizzle-orm');const {createSecretToken}=await import('../../src/modules/identity/tokens');
 const admin=randomUUID(),user=randomUUID();const adminToken=createSecretToken(),userToken=createSecretToken();const base=process.env.APP_URL!;const slug=`first-run-${randomUUID()}`;let categoryId:string|undefined,organizationId:string|undefined,templateId:string|undefined;
 const request=(path:string,method='GET',body?:unknown,token:string|undefined=adminToken.token,origin=base)=>fetch(`${base}${path}`,{method,headers:{...(token?{Cookie:`tndocs_session=${token}`}:{Cookie:''}),Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 try{
  await database!.insert(s.users).values([{id:admin,email:`taxonomy-admin-${admin}@example.test`,passwordHash:'synthetic-test',status:'active',role:'admin'},{id:user,email:`taxonomy-user-${user}@example.test`,passwordHash:'synthetic-test',status:'active',role:'user'}]);
  await database!.insert(s.sessions).values([{id:randomUUID(),userId:admin,tokenHash:adminToken.hash,expiresAt:new Date(Date.now()+3600000)},{id:randomUUID(),userId:user,tokenHash:userToken.hash,expiresAt:new Date(Date.now()+3600000)}]);
  assert.equal((await request('/api/v1/admin/catalog/categories','GET',undefined,'')).status,401);
  assert.equal((await request('/api/v1/admin/catalog/categories','GET',undefined,userToken.token)).status,403);
  const payload={slug,translations:{fr:{name:'Catégorie fictive premier démarrage'}}};
  assert.equal((await request('/api/v1/admin/catalog/categories','POST',payload,adminToken.token,'https://invalid.example')).status,403);
  let response=await request('/api/v1/admin/catalog/categories','POST',payload);assert.equal(response.status,201,await response.clone().text());categoryId=(await response.json()).id;
  response=await request('/api/v1/admin/catalog/categories','POST',payload);assert.equal(response.status,409);
  response=await request('/api/v1/admin/catalog/categories','PATCH',{id:categoryId,slug:'cannot-rename'});assert.equal(response.status,400);
  response=await request('/api/v1/admin/catalog/categories','PATCH',{id:categoryId,parentId:categoryId});assert.equal(response.status,409);
  response=await request('/api/v1/admin/catalog/organizations','POST',{slug:`org-${slug}`,officialUrl:'https://user:password@example.test',translations:{fr:{name:'Organisme fictif'}}});assert.equal(response.status,400);
  response=await request('/api/v1/admin/catalog/organizations','POST',{slug:`org-${slug}`,officialUrl:'https://example.test/official',translations:{ar:{name:'هيئة خيالية'}}});assert.equal(response.status,201,await response.clone().text());organizationId=(await response.json()).id;
  response=await request('/api/v1/admin/catalog/templates','POST',{documentType:'editable',organizationId,categorySlugs:[slug],translations:{fr:{title:'Premier modèle fictif',summary:'Test local sans contenu officiel',body:'Texte fictif.'}},sources:[]});assert.equal(response.status,201,await response.clone().text());templateId=(await response.json()).templateId;
  response=await request('/api/v1/admin/catalog/categories','PATCH',{id:categoryId,active:false});assert.equal(response.status,200);
  response=await request('/api/v1/admin/catalog/categories');assert.equal(response.status,200);const category=(await response.json()).categories.find((item:{id:string})=>item.id===categoryId);assert.equal(category.active,false);assert.equal(category.translations.ar,null);
  for(const locale of ['fr','ar'])assert.equal((await request(`/${locale}/admin/classement`)).status,200);
 }finally{
  if(templateId)await database!.delete(s.catalogTemplates).where(eq(s.catalogTemplates.id,templateId));if(categoryId)await database!.delete(s.catalogCategories).where(eq(s.catalogCategories.id,categoryId));if(organizationId)await database!.delete(s.catalogOrganizations).where(eq(s.catalogOrganizations.id,organizationId));await database!.delete(systemAuditEvents).where(eq(systemAuditEvents.actorUserId,admin));await database!.delete(s.users).where(inArray(s.users.id,[admin,user]));
 }
});
