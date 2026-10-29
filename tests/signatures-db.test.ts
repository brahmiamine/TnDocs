import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {deflateSync} from 'node:zlib';
const url=process.env.TEST_DATABASE_URL;
test('MariaDB signatures: encrypted transactional invitation, recipient verification replay, immutable decision, scoped revocation and export', {skip:!url||!/\/tndocs_verify\w*(?:\?|$)/.test(url)},async()=>{
 process.env.DATABASE_URL=url;process.env.DOCUMENT_ENCRYPTION_KEY_V1=Buffer.alloc(32,89).toString('base64');process.env.SMTP_HOST='127.0.0.1';
 const [{database},schema,{signatureRequests,signatureParticipants,signatureAssets},{jobs},crypto,protocol,service,{performSignatureMail},{exportOwnSignatureData},{eq,and}]=await Promise.all([import('../src/platform/database/client'),import('../src/platform/database/schema'),import('../src/modules/signatures/db-schema'),import('../src/platform/jobs/schema'),import('../src/modules/documents/crypto'),import('../src/modules/signatures/protocol'),import('../src/modules/signatures/service'),import('../src/modules/signatures/mailer'),import('../src/modules/signatures/export-data'),import('drizzle-orm')]);
 assert.ok(database);const owner=randomUUID(),other=randomUUID(),documentId=randomUUID();
 const content={title:'Document fictif',locale:'ar' as const,body:'نص اختبار',answers:{}};
 const pngChunk=(type:string,data:Buffer)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(protocol.crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),pngChunk('IEND',Buffer.alloc(0))]);
 try{
  await database.insert(schema.users).values([owner,other].map(id=>({id,email:`${id}@signatures.example.test`,passwordHash:'unusable-test-password',status:'active' as const,emailVerifiedAt:new Date()})));
  await database.insert(schema.personalDocuments).values({id:documentId,ownerUserId:owner,title:content.title,currentRevision:1});
  const encrypted=crypto.encryptDocumentData(content,owner,documentId,1);await database.insert(schema.documentRevisions).values({id:randomUUID(),documentId,revision:1,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion,createdBy:owner});
  await assert.rejects(service.createSignRequest(other,documentId,{expectedRevision:1,locale:'fr',expiresAt:new Date(Date.now()+3600000).toISOString(),recipients:['recipient@example.test']}),/NOT_FOUND/);
  const request=await service.createSignRequest(owner,documentId,{expectedRevision:1,locale:'fr',expiresAt:new Date(Date.now()+3600000).toISOString(),recipients:['recipient@example.test']});
  assert.equal(request.contentHash,protocol.signatureDigest(content,1));assert.equal(request.deliveryStatus,'queued');
  const mailJobs=await database.select().from(jobs).where(and(eq(jobs.ownerUserId,owner),eq(jobs.kind,'signature.mail')));assert.equal(mailJobs.length,1);
  const mailJob=mailJobs[0];assert.equal(JSON.stringify(mailJob.payload).includes('recipient@example.test'),false);
  const invite=crypto.decryptDossierData<{token:string}>(String(mailJob.payload.messageCiphertext),String(mailJob.payload.keyVersion),owner,String(mailJob.payload.scopeId));assert.equal(JSON.stringify(mailJob.payload).includes(invite.token),false);
  let sends=0;await assert.rejects(performSignatureMail(mailJob,async()=>{sends++;throw new Error('SMTP_SIMULATED_OUTAGE');}),/SMTP_SIMULATED_OUTAGE/);assert.equal(sends,1);
  const [pendingMail]=await database.select().from(jobs).where(eq(jobs.id,mailJob.id));assert.equal(pendingMail.status,'pending');
  await service.requestSignatureVerification(invite.token,'fr');
  const after=await database.select().from(jobs).where(and(eq(jobs.ownerUserId,owner),eq(jobs.kind,'signature.mail')));assert.equal(after.length,2);
  const verificationJob=after.find(job=>job.id!==mailJob.id)!;
  const verification=crypto.decryptDossierData<{token:string}>(String(verificationJob.payload.messageCiphertext),String(verificationJob.payload.keyVersion),owner,String(verificationJob.payload.scopeId));
  const verified=await Promise.allSettled([service.verifySignatureRecipient(verification.token),service.verifySignatureRecipient(verification.token)]);assert.equal(verified.filter(result=>result.status==='fulfilled').length,1);
  const access=(verified.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<string>).value;
  const view=await service.getSignatureViewForToken(access);assert.equal(view.content.body,content.body);
  await assert.rejects(service.getSignatureViewForToken('wrong-token'),/INVITATION_UNAVAILABLE/);
  const input={decision:'signed' as const,consent:true,contentHash:request.contentHash,signaturePng:`data:image/png;base64,${png.toString('base64')}`,placement:{page:1,x:.1,y:.7,width:.3,height:.1},kind:'signature' as const};
  const decisions=await Promise.allSettled([service.decideSignatureForToken(input,access),service.decideSignatureForToken(input,access)]);assert.equal(decisions.filter(result=>result.status==='fulfilled').length,1);
  const evidence=await service.getSignatureEvidence(owner,documentId,request.id);assert.equal(evidence.overlays.length,1);assert.equal(evidence.contentHash,request.contentHash);assert.equal(evidence.overlays[0].png,input.signaturePng);
  await assert.rejects(service.getSignatureEvidence(other,documentId,request.id),/NOT_FOUND/);
  await assert.rejects(service.revokeSignRequest(other,documentId,request.id),/NOT_FOUND/);
  await service.revokeSignRequest(owner,documentId,request.id);await assert.rejects(service.getSignatureViewForToken(access),/INVITATION_UNAVAILABLE/);
  assert.deepEqual(await performSignatureMail(verificationJob,async()=>{throw new Error('MUST_NOT_SEND');}),{skipped:true});
  const historical=await service.getSignatureEvidence(owner,documentId,request.id);assert.equal(historical.overlays.length,1);
  const exported=await exportOwnSignatureData(owner),json=JSON.stringify(exported);assert.ok(json.includes('recipient@example.test'));assert.equal(json.includes('TokenHash'),false);assert.equal(json.includes(invite.token),false);assert.equal(json.includes(verification.token),false);
  const [participant]=await database.select().from(signatureParticipants).where(eq(signatureParticipants.requestId,request.id));assert.ok(participant.signatureCiphertext?.startsWith('v1.'));assert.equal(participant.signatureCiphertext?.includes('data:image'),false);
  const [signedRevision]=await database.select().from(schema.documentRevisions).where(eq(schema.documentRevisions.documentId,documentId));assert.equal(signedRevision.contentCiphertext,encrypted.ciphertext);
  assert.equal((await database.select().from(signatureRequests).where(eq(signatureRequests.ownerUserId,other))).length,0);assert.equal((await database.select().from(signatureAssets).where(eq(signatureAssets.ownerUserId,other))).length,0);
 }finally{
  await database.delete(jobs).where(eq(jobs.ownerUserId,owner));await database.delete(schema.personalDocuments).where(eq(schema.personalDocuments.id,documentId));await database.delete(schema.users).where(eq(schema.users.id,owner));await database.delete(schema.users).where(eq(schema.users.id,other));
  const {hashSecretToken}=await import('../src/modules/identity/tokens');for(const user of [owner,other])await database.delete(schema.loginAttemptLimits).where(eq(schema.loginAttemptLimits.keyHash,hashSecretToken(`signature-create:${user}`)));
  await (database as unknown as {$client:{end():Promise<void>}}).$client.end();
 }
});
