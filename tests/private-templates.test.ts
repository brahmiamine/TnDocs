import assert from 'node:assert/strict';
import test from 'node:test';
import { privateTemplateInputSchema, sanitizeReusableTemplate, encryptPrivateTemplate, decryptPrivateTemplate } from '../src/modules/private-templates/model';
const source={title:'Modèle fictif',body:'Je soussigné {{name}}.',locale:'fr',formSchema:{schemaVersion:1,fields:[{key:'name',kind:'text',label:{fr:'Nom',ar:'الاسم'},required:true}]}};
test('private models require explicit sanitation review and valid declared form fields',()=>{
 assert.equal(privateTemplateInputSchema.safeParse(source).success,false);
 assert.equal(privateTemplateInputSchema.safeParse({...source,confirmSanitized:true}).success,true);
 assert.equal(privateTemplateInputSchema.safeParse({...source,confirmSanitized:true,signature:'data:image/png;base64,foo'}).success,false);
});
test('reusable starter discards personal answers, signatures and extra metadata',()=>{
 const clean=sanitizeReusableTemplate({...source,answers:{name:'PRIVATE'},signature:'PRIVATE',email:'private@example.test'});
 assert.equal(JSON.stringify(clean).includes('PRIVATE'),false);
 assert.deepEqual(Object.keys(clean).sort(),['body','formSchema','locale','title']);
});
test('private model ciphertext is bound to owner, model identity and immutable version',()=>{
 process.env.DOCUMENT_ENCRYPTION_KEY_V1=Buffer.alloc(32,7).toString('base64');
 const model=sanitizeReusableTemplate(source);
 const cipher=encryptPrivateTemplate(model,'owner-a','model-a',1);
 assert.equal(cipher.ciphertext.includes('soussigné'),false);
 assert.deepEqual(decryptPrivateTemplate(cipher.ciphertext,cipher.keyVersion,'owner-a','model-a',1),model);
 assert.throws(()=>decryptPrivateTemplate(cipher.ciphertext,cipher.keyVersion,'owner-b','model-a',1));
 assert.throws(()=>decryptPrivateTemplate(cipher.ciphertext,cipher.keyVersion,'owner-a','model-b',1));
 assert.throws(()=>decryptPrivateTemplate(cipher.ciphertext,cipher.keyVersion,'owner-a','model-a',2));
});
