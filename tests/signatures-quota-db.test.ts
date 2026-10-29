import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';import {deflateSync} from 'node:zlib';
const url=process.env.TEST_DATABASE_URL;
test('MariaDB signatures: 40KiB PNG round-trips; assets and participant images respect atomic account quota',{skip:!url||!/\/tndocs_verify\w*(?:\?|$)/.test(url)},async()=>{
 process.env.DATABASE_URL=url;process.env.DOCUMENT_ENCRYPTION_KEY_V1=Buffer.alloc(32,91).toString('base64');process.env.ACCOUNT_STORAGE_QUOTA_BYTES='10000000';
 const [{database},schema,signatureDb,crypto,protocol,assets,service,quota,tokens,{eq,and}]=await Promise.all([import('../src/platform/database/client'),import('../src/platform/database/schema'),import('../src/modules/signatures/db-schema'),import('../src/modules/documents/crypto'),import('../src/modules/signatures/protocol'),import('../src/modules/signatures/assets'),import('../src/modules/signatures/service'),import('../src/platform/storage/quota'),import('../src/modules/identity/tokens'),import('drizzle-orm')]);
 assert.ok(database);const owner=randomUUID(),other=randomUUID(),doc=randomUUID(),requestId=randomUUID(),participantId=randomUUID(),access=tokens.createSecretToken();
 const chunk=(type:string,data:Buffer)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(protocol.crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);};
 const width=64,height=160,header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const pixels=randomBytes((width*4+1)*height);for(let row=0;row<height;row++)pixels[row*(width*4+1)]=0;
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]),uri=`data:image/png;base64,${png.toString('base64')}`;
 assert.ok(png.length>40*1024&&png.length<43*1024);protocol.validateSignaturePng(png);
 const input={label:'Fixture PNG',kind:'signature' as const,png:uri,consent:true as const};
 const used=async()=>database.transaction(tx=>quota.assertStorageQuota(tx,owner,0));
 try{
  await database.insert(schema.users).values([owner,other].map(id=>({id,email:`${id}@quota.example.test`,passwordHash:'unusable-test-password',status:'active' as const,emailVerifiedAt:new Date()})));
  await database.insert(schema.personalDocuments).values({id:doc,ownerUserId:owner,title:'Fixture',currentRevision:1});
  const content={title:'Fixture',locale:'fr' as const,body:'Text',answers:{}},encrypted=crypto.encryptDocumentData(content,owner,doc,1);
  await database.insert(schema.documentRevisions).values({id:randomUUID(),documentId:doc,revision:1,createdBy:owner,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion});
  const email=crypto.encryptDossierData('recipient@example.test',owner,participantId);
  await database.insert(signatureDb.signatureRequests).values({id:requestId,ownerUserId:owner,documentId:doc,revision:1,contentHash:protocol.signatureDigest(content,1),expiresAt:new Date(Date.now()+3600000)});
  await database.insert(signatureDb.signatureParticipants).values({id:participantId,requestId,emailCiphertext:email.ciphertext,encryptionKeyVersion:email.keyVersion,inviteTokenHash:tokens.createSecretToken().hash,accessTokenHash:access.hash,verifiedAt:new Date(),status:'viewed'});
  const baseline=await used();assert.equal(baseline.used,Buffer.byteLength(encrypted.ciphertext)+Buffer.byteLength(email.ciphertext));
  const saved=await assets.createSignatureAsset(owner,input),roundTrip=await assets.getSignatureAsset(owner,saved.id);assert.equal(roundTrip.png,uri);
  const [stored]=await database.select().from(signatureDb.signatureAssets).where(eq(signatureDb.signatureAssets.id,saved.id));assert.ok(Buffer.byteLength(stored.dataCiphertext)>65535);
  const assetBytes=Buffer.byteLength(stored.dataCiphertext),afterAsset=await used();assert.equal(afterAsset.used-baseline.used,assetBytes);
  process.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(afterAsset.used+assetBytes-1);await assert.rejects(assets.createSignatureAsset(owner,input),/STORAGE_QUOTA_EXCEEDED/);
  assert.equal((await database.select().from(signatureDb.signatureAssets).where(eq(signatureDb.signatureAssets.ownerUserId,owner))).length,1);
  process.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(afterAsset.used+assetBytes);
  const parallel=await Promise.allSettled([assets.createSignatureAsset(owner,input),assets.createSignatureAsset(owner,input)]);assert.equal(parallel.filter(result=>result.status==='fulfilled').length,1);
  const full=await used();assert.equal(full.used,afterAsset.used+assetBytes);
  const decision={decision:'signed' as const,consent:true,contentHash:protocol.signatureDigest(content,1),signaturePng:uri,placement:{page:1,x:.1,y:.7,width:.3,height:.1}};
  await assert.rejects(service.decideSignatureForToken(decision,access.token),/STORAGE_QUOTA_EXCEEDED/);
  const [notSigned]=await database.select().from(signatureDb.signatureParticipants).where(eq(signatureDb.signatureParticipants.id,participantId));assert.equal(notSigned.status,'viewed');assert.equal(notSigned.signatureCiphertext,null);
  const signatureBytes=Buffer.byteLength(crypto.encryptDossierData({png:uri,kind:'signature',placement:decision.placement,contentHash:decision.contentHash,revision:1},owner,participantId).ciphertext);
  process.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(full.used+Math.max(assetBytes,signatureBytes));
  const mixed=await Promise.allSettled([assets.createSignatureAsset(owner,input),service.decideSignatureForToken(decision,access.token)]);assert.equal(mixed.filter(result=>result.status==='fulfilled').length,1,'asset and signature cannot both spend the same remaining quota');
  process.env.ACCOUNT_STORAGE_QUOTA_BYTES='10000000';if(mixed[1].status==='rejected')await service.decideSignatureForToken(decision,access.token);
  const [signed]=await database.select().from(signatureDb.signatureParticipants).where(eq(signatureDb.signatureParticipants.id,participantId));assert.equal(signed.status,'signed');assert.ok(Buffer.byteLength(signed.signatureCiphertext!)>65535);
  const storedSignature=crypto.decryptDossierData<{png:string}>(signed.signatureCiphertext!,signed.encryptionKeyVersion,owner,participantId);assert.equal(storedSignature.png,uri);
  assert.equal((await used()).used-full.used,Buffer.byteLength(signed.signatureCiphertext!)+(mixed[0].status==='fulfilled'?assetBytes:0));
  process.env.ACCOUNT_STORAGE_QUOTA_BYTES=String(assetBytes+1);const isolated=await assets.createSignatureAsset(other,input);assert.equal((await assets.getSignatureAsset(other,isolated.id)).png,uri);
  await assert.rejects(assets.getSignatureAsset(other,saved.id),/NOT_FOUND/);
  assert.equal((await database.select().from(signatureDb.signatureEvents).where(and(eq(signatureDb.signatureEvents.requestId,requestId),eq(signatureDb.signatureEvents.eventType,'signed')))).length,1);
 }finally{
  process.env.ACCOUNT_STORAGE_QUOTA_BYTES='10000000';
  await database.delete(schema.personalDocuments).where(eq(schema.personalDocuments.id,doc));await database.delete(schema.users).where(eq(schema.users.id,owner));await database.delete(schema.users).where(eq(schema.users.id,other));await (database as unknown as {$client:{end():Promise<void>}}).$client.end();
 }
});
