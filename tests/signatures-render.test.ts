import test from 'node:test';
import assert from 'node:assert/strict';
import { signaturePlacementSchema,toPdfRectangle } from '../src/modules/signatures/placement';
import { applySignatureOverlays } from '../src/modules/signatures/artifacts';
import { PDFDocument } from 'pdf-lib';
test('placements respect page bounds and PDF bottom-left origin',()=>{
 const placement={page:1,x:.1,y:.7,width:.3,height:.1};
 assert.deepEqual(toPdfRectangle(placement,600,800),{x:60,y:160.00000000000003,width:180,height:80});
 assert.equal(signaturePlacementSchema.safeParse({...placement,x:.9}).success,false);
 assert.equal(signaturePlacementSchema.safeParse({...placement,page:0}).success,false);
 assert.equal(signaturePlacementSchema.safeParse({...placement,height:0}).success,false);
});
test('signed PDF refuses nonexistent pages rather than dropping a signature',async()=>{
 const pdf=await PDFDocument.create();pdf.addPage([595,842]);const bytes=Buffer.from(await pdf.save());
 await assert.rejects(applySignatureOverlays(bytes,[{participantId:'id',png:'data:image/png;base64,',kind:'signature',page:2,x:.1,y:.7,width:.3,height:.1,signedAt:new Date(),contentHash:'abc'}]),/SIGNATURE_PAGE_OUT_OF_RANGE/);
 const output=await applySignatureOverlays(bytes,[]);assert.equal((await PDFDocument.load(output)).getPageCount(),1);
});

test('signed PDF embeds actual PNG overlays and audit evidence; DOCX retains Arabic body and image',async()=>{
 const {deflateSync}=await import('node:zlib');const {crc32}=await import('../src/modules/signatures/protocol');
 const chunk=(type:string,data:Buffer)=>{const tag=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([tag,data])));return Buffer.concat([length,tag,data,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;
 const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,0,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);
 const {attachSignatureEvidence,renderSignedDocx}=await import('../src/modules/signatures/artifacts');
 const {PDFName,PDFDict}=await import('pdf-lib'); const {unzipSync,strFromU8}=await import('fflate');
 const evidence={requestId:'req',documentId:'doc',revision:3,contentHash:'abc',createdAt:new Date('2026-01-01'),revokedAt:null,content:{title:'تفويض',body:'{{name}}',locale:'ar' as const},renderedBody:'الاسم العربي',participants:[{id:'p',email:'fictif@example.test',status:'signed',signedAt:new Date('2026-01-02')}],overlays:[{participantId:'p',png:`data:image/png;base64,${png.toString('base64')}`,kind:'signature' as const,page:1,x:.1,y:.7,width:.3,height:.1,signedAt:new Date('2026-01-02'),contentHash:'abc'}]};
 const pdf=await PDFDocument.create();pdf.addPage([595,842]);
 const output=await attachSignatureEvidence(await applySignatureOverlays(Buffer.from(await pdf.save()),evidence.overlays),evidence);const loaded=await PDFDocument.load(output);
 const resources=loaded.getPage(0).node.Resources()!;assert.ok(resources.lookup(PDFName.of('XObject'),PDFDict).keys().length>0);
 assert.ok(loaded.catalog.get(PDFName.of('Names')));assert.equal(loaded.getTitle(),'تفويض');
 const docx=unzipSync(await renderSignedDocx(evidence));const xml=strFromU8(docx['word/document.xml']);
 const bilingual={...evidence,answers:{name:'Complete'},content:{...evidence.content,secondary:{locale:'fr' as const,title:'French title',body:'Translation {{name}}'}}};const bilingualXml=strFromU8(unzipSync(await renderSignedDocx(bilingual))['word/document.xml']);assert.ok(bilingualXml.includes('الاسم العربي'));assert.ok(bilingualXml.includes('French title'));assert.ok(bilingualXml.includes('Translation Complete'));
 assert.ok(xml.includes('الاسم العربي'));assert.ok(xml.includes('abc'));assert.ok(xml.includes('w:rtl'));assert.ok(xml.includes('a:blip'));assert.ok(Object.keys(docx).some(path=>path.startsWith('word/media/')));
});
