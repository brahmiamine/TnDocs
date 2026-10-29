import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {PDFDocument} from 'pdf-lib';
import {renderDocumentPdf} from '../../src/modules/documents/pdf-renderer';
import {renderDocumentDocx} from '../../src/modules/documents/docx-renderer';
import {unzipSync,strFromU8} from 'fflate';
const enabled=Boolean(process.env.CHROMIUM_EXECUTABLE_PATH);
test('Chromium bilingual PDF and DOCX contain both scripts and common answers on correctly directed sections',{skip:!enabled},async()=>{
 const secondary={locale:'ar' as const,title:'مثال خيالي عربي',body:'مرحبا {{name}}\nBODYAR456'};const answers={name:'TEST PERSON'};
 const pdf=await renderDocumentPdf('Exemple fictif français','Bonjour TEST PERSON\nBODYFR123','fr',undefined,answers,secondary);
 assert.equal((await PDFDocument.load(pdf)).getPageCount(),2);
 const dir=await mkdtemp(join(tmpdir(),'tndocs-bilingual-'));
 try{const path=join(dir,'bilingual.pdf');await writeFile(path,pdf);const {stdout}=await promisify(execFile)('pdftotext',['-layout',path,'-']);assert.ok(stdout.includes('BODYFR123'));assert.ok(stdout.includes('BODYAR456'));assert.match(stdout,/[\u0600-\u06ff]/);assert.equal((stdout.match(/TEST PERSON/g)??[]).length,2);}finally{await rm(dir,{recursive:true,force:true});}
 const xml=strFromU8(unzipSync(await renderDocumentDocx('Exemple fictif français','Bonjour TEST PERSON\nBODYFR123','fr',undefined,answers,secondary))['word/document.xml']);
 for(const value of ['Bonjour TEST PERSON','مرحبا TEST PERSON','BODYFR123','BODYAR456','w:pageBreakBefore','w:rtl','w:bidi'])assert.ok(xml.includes(value),value);
});
