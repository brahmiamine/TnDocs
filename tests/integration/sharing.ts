import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Run only against a dedicated disposable local MariaDB and running application.
// TEST_APP_URL=http://127.0.0.1:3100 node --import tsx tests/integration/sharing.ts
if (!process.env.TEST_APP_URL || !process.env.DATABASE_URL) throw new Error('Set TEST_APP_URL and DATABASE_URL for the isolated integration environment.');
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.TEST_APP_URL).hostname) || !/(test|verify)/i.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Sharing integration requires a local test/verify database.');
async function main() {
 const { database: db } = await import('../../src/platform/database/client');
 if (!db) throw new Error('Test DB unavailable');
 const { users, sessions, personalDocuments, documentRevisions, personalDocumentShares } = await import('../../src/platform/database/schema');
 const { privateDocumentModels } = await import('../../src/modules/private-templates/db-schema');
 const { encryptDocumentData } = await import('../../src/modules/documents/crypto');
 const { encryptPrivateDocumentModel } = await import('../../src/modules/private-templates/model');
 const { createSecretToken } = await import('../../src/modules/identity/tokens');
 const { eq, and } = await import('drizzle-orm');
 const base = process.env.TEST_APP_URL!;
 const suffix = randomUUID();
 const owner = { id: randomUUID(), email: `sharing-owner-${suffix}@example.test`, token: createSecretToken() };
 const recipient = { id: randomUUID(), email: `sharing-recipient-${suffix}@example.test`, token: createSecretToken() };
 const third = { id: randomUUID(), email: `sharing-third-${suffix}@example.test`, token: createSecretToken() };
 const unverified = { id: randomUUID(), email: `sharing-unverified-${suffix}@example.test`, token: createSecretToken() };
 for (const actor of [owner, recipient, third, unverified]) {
   await db.insert(users).values({id: actor.id, email: actor.email, passwordHash:'integration-session-only-no-password-login',status:'active',role:'user',emailVerifiedAt:actor===unverified?null:new Date()});
   await db.insert(sessions).values({id:randomUUID(),userId:actor.id,tokenHash:actor.token.hash,expiresAt:new Date(Date.now()+3600000)});
 }
 const documentId=randomUUID();
 const model={title:'Sharing test fictitious',locale:'fr' as const,body:'Bonjour {{nom}}',formSchema:{schemaVersion:1 as const,fields:[{key:'nom',kind:'text' as const,label:{fr:'Nom',ar:'اسم'},required:false}]}};
 const content={title:model.title,locale:'fr' as const,body:model.body,answers:{nom:'Fictif'},secondary:{locale:'ar' as const,title:'وثيقة تجريبية',body:'مرحبا {{nom}}'}};
 const encrypted=encryptDocumentData(content,owner.id,documentId,1);
 const definition=encryptPrivateDocumentModel(model,owner.id,documentId);
 await db.insert(personalDocuments).values({id:documentId,ownerUserId:owner.id,title:model.title,status:'draft',currentRevision:1});
 await db.insert(documentRevisions).values({id:randomUUID(),documentId,revision:1,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion,createdBy:owner.id});
 await db.insert(privateDocumentModels).values({documentId,sourceVersion:1,contentCiphertext:definition.ciphertext,encryptionKeyVersion:definition.keyVersion});
 let checks=0;
 async function call(path:string,actor:typeof owner|null,body?:unknown,method='POST',origin=base){
  const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(actor?{Cookie:`tndocs_session=${actor.token.token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();return {status:response.status,data:result};
 }
 function expect(actual:unknown,expected:unknown,label:string){assert.deepEqual(actual,expected,label);checks++;}
 async function grant(permissions:{view:boolean;copy:boolean;edit:boolean},expectedRevision:number,email=recipient.email){
  const result=await call(`/api/v1/me/documents/${documentId}/shares`,owner,{recipientEmail:email,expectedRevision,expiresAt:new Date(Date.now()+3600000).toISOString(),locale:'fr',permissions});
  expect(result.status,201,'owner creates nominative grant');
  expect(new URL(result.data.url).search,'','token absent from query');
  return {id:result.data.share.id,token:new URL(result.data.url).hash.slice(1)};
 }
 const view=await grant({view:true,copy:false,edit:false},1);
 expect((await call('/api/v1/shares/access',null,{token:view.token})).status,401,'anonymous denied');
 expect((await call('/api/v1/shares/access',third,{token:view.token})).status,404,'wrong verified recipient denied');
 expect((await call('/api/v1/shares/access',recipient,{token:view.token},'POST','https://evil.invalid')).status,403,'cross-origin denied');
 const viewed=await call('/api/v1/shares/access',recipient,{token:view.token});expect(viewed.status,200,'nominated verified recipient reads');expect(viewed.data.content.body,content.body,'source content exact');expect(viewed.data.content.secondary,content.secondary,'bilingual section preserved on recipient read');
 expect((await call('/api/v1/shares/copy',recipient,{token:view.token})).status,404,'view does not grant copy');
 expect((await call('/api/v1/shares/edit',recipient,{token:view.token,expectedRevision:1,title:'Denied',content})).status,404,'view does not grant edit');
 const copy=await grant({view:false,copy:true,edit:false},1);
 const copyOnly=await call('/api/v1/shares/access',recipient,{token:copy.token});expect(copyOnly.status,200,'copy-only metadata');expect(copyOnly.data.content,null,'copy-only source hidden');
 const copied=await call('/api/v1/shares/copy',recipient,{token:copy.token});expect(copied.status,201,'copy permitted');
 expect((await call(`/api/v1/me/documents/${copied.data.id}`,recipient,undefined,'GET')).status,200,'copy privately owned by recipient');
 expect((await call(`/api/v1/me/documents/${copied.data.id}`,owner,undefined,'GET')).status,404,'source owner cannot read recipient copy');
 const edit=await grant({view:false,copy:false,edit:true},1);
 expect((await call('/api/v1/shares/copy',recipient,{token:edit.token})).status,404,'edit does not grant copy');
 const editContent={...content,body:'Révision modifiée {{nom}}'};
 const removedSecondary:Partial<typeof editContent>={...editContent};delete removedSecondary.secondary;
 expect((await call('/api/v1/shares/edit',recipient,{token:edit.token,expectedRevision:1,title:'Rejected loss of translation',content:removedSecondary})).status,400,'editing cannot drop pinned bilingual section');
 const edited=await call('/api/v1/shares/edit',recipient,{token:edit.token,expectedRevision:1,title:'Révision modifiée',content:editContent});expect(edited.status,200,'recipient appends revision');expect(edited.data.revision,2,'revision increments');
 expect((await call('/api/v1/shares/edit',recipient,{token:edit.token,expectedRevision:1,title:'Conflict',content:editContent})).status,409,'stale edit rejected');
 const stillPinned=await call('/api/v1/shares/access',recipient,{token:view.token});expect(stillPinned.data.content.body,content.body,'other grant remains pinned immutable');expect(stillPinned.data.revision,1,'other share revision immutable');
 const ownerSaved=await call(`/api/v1/me/documents/${documentId}/revisions`,owner,{expectedRevision:2,title:'Owner change',content:{...content,body:'Owner text'}});expect(ownerSaved.status,200,'owner updates current revision');
 expect((await call('/api/v1/shares/edit',recipient,{token:edit.token,expectedRevision:2,title:'Conflict',content:editContent})).status,409,'owner drift rejected');
 const fresh=await grant({view:true,copy:false,edit:true},3);
 const racing=await Promise.all([call('/api/v1/shares/edit',recipient,{token:fresh.token,expectedRevision:3,title:'Racer A',content:{...content,body:'Race A'}}),call('/api/v1/shares/edit',recipient,{token:fresh.token,expectedRevision:3,title:'Racer B',content:{...content,body:'Race B'}})]);
 expect(racing.map(value=>value.status).sort(),[200,409],'simultaneous expectedRevision single winner');
 const rows=await db.select().from(documentRevisions).where(eq(documentRevisions.documentId,documentId));expect(rows.length,4,'all immutable revisions retained');expect(rows.find(row=>row.revision===2)?.createdBy,recipient.id,'recipient actor recorded');
 expect((await call(`/api/v1/me/documents/${documentId}/shares/${fresh.id}`,third,undefined,'DELETE')).status,404,'third cannot revoke');
 expect((await call(`/api/v1/me/documents/${documentId}/shares/${fresh.id}`,owner,undefined,'DELETE')).status,200,'owner revokes');
 expect((await call(`/api/v1/me/documents/${documentId}/shares/${fresh.id}`,owner,undefined,'DELETE')).status,200,'revoke idempotent');
 expect((await call('/api/v1/shares/access',recipient,{token:fresh.token})).status,404,'revocation denies access');
 const legacy=createSecretToken();await db.insert(personalDocumentShares).values({id:randomUUID(),documentId,revision:1,tokenHash:legacy.hash,permission:'copy',expiresAt:new Date(Date.now()+3600000)});
 expect((await call('/api/v1/shares/access',recipient,{token:legacy.token})).status,404,'legacy bearer source access disabled');expect((await call('/api/v1/shares/copy',recipient,{token:legacy.token})).status,404,'legacy copy disabled');
 const unverifiedGrant=await grant({view:true,copy:false,edit:false},4,unverified.email);expect((await call('/api/v1/shares/access',unverified,{token:unverifiedGrant.token})).status,401,'unverified nominated account denied');
 const expired=await grant({view:true,copy:false,edit:false},4);await db.update(personalDocumentShares).set({expiresAt:new Date(Date.now()-10000)}).where(eq(personalDocumentShares.id,expired.id));expect((await call('/api/v1/shares/access',recipient,{token:expired.token})).status,404,'expired grant denied');
 const [original]=await db.select().from(documentRevisions).where(and(eq(documentRevisions.documentId,documentId),eq(documentRevisions.revision,1)));expect(original.contentCiphertext,encrypted.ciphertext,'original ciphertext never rewritten');
 console.log(`SHARING_INTEGRATION_OK checks=${checks}`);
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:error);process.exit(1)});
