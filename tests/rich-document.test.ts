import test from 'node:test';import assert from 'node:assert/strict';
import { richDocumentSchema,richDocumentHtml,richDocumentText,richDocumentFromText } from '../src/modules/documents/rich-document';
import { renderRichDocx } from '../src/modules/documents/rich-document-docx';
import { unzipSync,strFromU8 } from 'fflate';
const sample={version:1,blocks:[{type:'paragraph',children:[{text:'Bonjour {{name}}',bold:true},{text:' <script>evil</script>',italic:true}]},{type:'list',ordered:true,items:[{children:[{text:'واحد'}]},{children:[{text:'Deux'}]}]},{type:'table',rows:[{cells:[{children:[{text:'الحقل'}]},{children:[{text:'Valeur',underline:true}]}]}]}]};
test('AST rejects arbitrary markup nodes, URLs, unsupported styles, oversized text and ragged tables',()=>{
 assert.equal(richDocumentSchema.safeParse(sample).success,true);
 for(const blocks of [[{type:'html',html:'<script/>'}],[{type:'paragraph',children:[{text:'x',href:'https://evil.test'}]}],[{type:'paragraph',children:[{text:'x'.repeat(50001)}]}],[{type:'table',rows:[{cells:[{children:[{text:'a'}]}]},{cells:[{children:[{text:'a'}]},{children:[{text:'b'}]}]}]}]])assert.equal(richDocumentSchema.safeParse({version:1,blocks}).success,false);
});
test('HTML escapes user text and variables while preserving canonical lists, tables and RTL',()=>{
 const html=richDocumentHtml(richDocumentSchema.parse(sample),{name:'<img src=x onerror=evil>'},'ar');
 assert.ok(html.includes('<ol'));assert.ok(html.includes('<table'));assert.ok(html.includes('<strong>'));assert.ok(html.includes('dir="rtl"'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));
 assert.equal(richDocumentText(richDocumentSchema.parse(sample),{name:'Test'}),'Bonjour Test <script>evil</script>\n1. واحد\n2. Deux\nالحقل\tValeur');
 assert.equal(richDocumentText(richDocumentFromText('Une ligne\nعربي')),'Une ligne\nعربي');
});
test('DOCX derives same values, controlled marks, lists and tables from AST',async()=>{
 const bytes=await renderRichDocx('Titre',richDocumentSchema.parse(sample),{name:'Exemple'},'ar');const xml=strFromU8(unzipSync(bytes)['word/document.xml']);
 for(const expected of ['Bonjour Exemple','واحد','Deux','الحقل','Valeur','w:tbl','w:b','w:i','w:u','w:rtl'])assert.ok(xml.includes(expected),expected);
 assert.ok(!xml.includes('{{name}}'));
});
test('plain text compatibility preserves raw variables until answers are explicitly rendered',()=>{
 const raw='Bonjour {{name}}\nعربي {{role}}';assert.equal(richDocumentText(richDocumentFromText(raw)),raw);
 assert.equal(richDocumentText(richDocumentFromText(raw),{name:'Alice',role:'Test'}),'Bonjour Alice\nعربي Test');
 const long='x'.repeat(40000);assert.equal(richDocumentText(richDocumentFromText(long)),long);
 const many=Array.from({length:300},(_,i)=>`line ${i}`).join('\n');assert.equal(richDocumentText(richDocumentFromText(many)),many);
});
test('variables split across styled inline segments render identically in text, HTML and DOCX',async()=>{
 const rich=richDocumentSchema.parse({version:1,blocks:[{type:'paragraph',children:[{text:'Bonjour {{na',bold:true},{text:'me}} !',italic:true}]}]});
 assert.equal(richDocumentText(rich,{name:'Alice'}),'Bonjour Alice !');
 const html=richDocumentHtml(rich,{name:'Alice'});assert.ok(html.includes('Alice'));assert.ok(!html.includes('{{na'));
 const xml=strFromU8(unzipSync(await renderRichDocx('Titre',rich,{name:'Alice'}))['word/document.xml']);assert.ok(xml.includes('Alice'));assert.ok(!xml.includes('{{na'));
});
