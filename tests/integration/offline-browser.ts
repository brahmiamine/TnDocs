import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Dedicated local integration environment only. Uses fictitious accounts and encrypted documents.
if (!process.env.TEST_APP_URL || !process.env.DATABASE_URL) throw new Error('Set TEST_APP_URL and DATABASE_URL for the isolated browser environment.');
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.TEST_APP_URL).hostname) || !/(test|verify)/i.test(new URL(process.env.DATABASE_URL).pathname)) throw new Error('Offline integration requires a local test/verify database.');
async function main(){
 const { database:db }=await import('../../src/platform/database/client');if(!db)throw Error('DB missing');
 const {users,sessions,personalDocuments,documentRevisions}=await import('../../src/platform/database/schema');
 const {privateDocumentModels}=await import('../../src/modules/private-templates/db-schema');
 const {createSecretToken}=await import('../../src/modules/identity/tokens');
 const {encryptDocumentData}=await import('../../src/modules/documents/crypto');
 const {encryptPrivateDocumentModel}=await import('../../src/modules/private-templates/model');
 const ownerId=randomUUID(),documentId=randomUUID(),secret=createSecretToken();
 const base=process.env.TEST_APP_URL??process.env.APP_URL!;const cookieName=process.env.TEST_COOKIE_NAME??"tndocs_session";
 await db.insert(users).values({id:ownerId,email:`offline-${randomUUID()}@example.test`,passwordHash:'session-fixture-only',status:'active',emailVerifiedAt:new Date()});
 await db.insert(sessions).values({id:randomUUID(),userId:ownerId,tokenHash:secret.hash,expiresAt:new Date(Date.now()+3600000)});
 const model={title:'Offline fictitious',body:'Original fictitious body',locale:'fr' as const,formSchema:null};
 const content={...model,answers:{}};
 const encrypted=encryptDocumentData(content,ownerId,documentId,1),definition=encryptPrivateDocumentModel(model,ownerId,documentId);
 await db.insert(personalDocuments).values({id:documentId,ownerUserId:ownerId,title:model.title,status:'draft',currentRevision:1});
 await db.insert(documentRevisions).values({id:randomUUID(),documentId,revision:1,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion,createdBy:ownerId});
 await db.insert(privateDocumentModels).values({documentId,sourceVersion:1,contentCiphertext:definition.ciphertext,encryptionKeyVersion:definition.keyVersion});
 const puppeteer=await import('puppeteer-core');
 const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH!,headless:true,args:['--no-sandbox','--disable-setuid-sandbox'],userDataDir:`work/offline-chrome-${randomUUID()}`});
 try{
  const page=await browser.newPage();page.setDefaultTimeout(30000);
  await page.setCookie({name:cookieName,secure:cookieName.startsWith("__Host-"),path:'/',value:secret.token,url:base,httpOnly:true,sameSite:'Strict'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`${base}/fr/mes-documents/${documentId}`,{waitUntil:'networkidle0'});
  await page.waitForSelector('.document-body-input');console.log('stage: editor loaded');
  await page.click('details.auth-card > summary');
  await page.click('details.auth-card input[type=checkbox]');
  await page.type('details.auth-card input[type=password]','offline-browser-test-secret');
  await page.$eval('details.auth-card form',form=>(form as HTMLFormElement).requestSubmit());console.log('stage: opt-in submitted');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('details.auth-card button')).some(button=>button.textContent?.includes('Verrouiller')));
  console.log('stage: vault unlocked');await page.setOfflineMode(true);
  const localText='Local pending fictitious text';
  await page.click('.document-body-input');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.type('.document-body-input',localText);
  await page.waitForFunction(()=>document.querySelector('details.auth-card')?.textContent?.includes('Copie locale chiffrée enregistrée'));
  await new Promise(resolve=>setTimeout(resolve,500));
  console.log('stage: local ciphertext saved');const stored=await page.evaluate(async()=>{
   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('tndocs-private-drafts-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
   try{return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('drafts','readonly'),r=tx.objectStore('drafts').getAll();r.onsuccess=()=>resolve(JSON.stringify(r.result));r.onerror=()=>reject(r.error)})}finally{db.close()}
  });
  assert.equal(stored.includes(localText),false,'actual IndexedDB ciphertext never contains local text');
  assert.equal(stored.includes('Offline fictitious'),false,'actual IndexedDB ciphertext never contains title');
  const changed=await fetch(`${base}/api/v1/me/documents/${documentId}/revisions`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:`${cookieName}=${secret.token}`},body:JSON.stringify({expectedRevision:1,title:model.title,content:{locale:'fr',body:'Server changed while offline',answers:{}}})});
  assert.equal(changed.status,200,'another client saves while editor offline');
  console.log('stage: server changed');await page.setOfflineMode(false);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await page.waitForFunction(()=>document.body.textContent?.includes('Choisir une version avant de poursuivre'));
  console.log('stage: conflict shown');assert.equal(await page.$eval('.document-body-input',element=>(element as HTMLTextAreaElement).value),localText,'conflict preserves local input');
  await page.waitForFunction(()=>document.body.textContent?.includes('Server changed while offline'));assert.ok((await page.content()).includes('Server changed while offline'),'conflict shows server version');
  await page.evaluate(()=>{const button=Array.from(document.querySelectorAll('button')).find(item=>item.textContent?.includes('Créer une copie indépendante'));if(!button)throw Error('Copy choice missing');button.click()});
  await page.waitForFunction((original)=>location.pathname.startsWith('/fr/mes-documents/')&&!location.pathname.endsWith(original),{},documentId);
  await page.waitForSelector('.document-body-input');
  const copiedId=new URL(page.url()).pathname.split('/').pop();
  const headers={Cookie:`${cookieName}=${secret.token}`};
  const original=await (await fetch(`${base}/api/v1/me/documents/${documentId}`,{headers})).json();
  const copy=await (await fetch(`${base}/api/v1/me/documents/${copiedId}`,{headers})).json();
  assert.equal(original.document.content.body,'Server changed while offline','copy choice never overwrites server source');
  assert.equal(copy.document.content.body,localText,'copy retains local input');
  assert.equal(errors.length,0,`no browser application errors: ${errors.join(';')}`);
  console.log('OFFLINE_BROWSER_OK IndexedDB encryption + offline edit + concurrent conflict + independent copy');
 }finally{await browser.close()}
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:error);process.exit(1)});
