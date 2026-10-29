import {richDocumentHtml,type RichDocument} from './rich-document';
import type {SecondaryDocumentSection} from './schema';
import {renderTemplateText} from './form-schema';
import puppeteer from 'puppeteer-core';
function escapeHtml(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function documentHtml(title:string,body:string,locale:'fr'|'ar',richDocument?:RichDocument,answers:Record<string,unknown>={},secondary?:SecondaryDocumentSection){
 if(secondary?.locale===locale)throw new Error('INVALID_BILINGUAL_SECTIONS');
 function section(sectionTitle:string,sectionBody:string,sectionLocale:'fr'|'ar',rich?:RichDocument){return `<section class="document-language" lang="${sectionLocale}" dir="${sectionLocale==='ar'?'rtl':'ltr'}"><h1>${escapeHtml(sectionTitle)}</h1>${rich?richDocumentHtml(rich,answers,sectionLocale):sectionBody.split(/\r?\n/).map(line=>`<p>${escapeHtml(line)||'&#160;'}</p>`).join('')}</section>`;}
 return `<!doctype html><html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>@page{size:A4;margin:22mm}body{font-family:'Noto Sans Arabic','Noto Sans',sans-serif;font-size:12pt;line-height:1.7;overflow-wrap:anywhere}h1{font-size:17pt;text-align:center}p{white-space:pre-wrap;unicode-bidi:plaintext;orphans:3;widows:3}.document-language+.document-language{break-before:page}</style></head><body>${section(title,body,locale,richDocument)}${secondary?section(secondary.title??title,renderTemplateText(secondary.body,answers),secondary.locale,secondary.richDocument):''}</body></html>`;
}
export async function renderDocumentPdf(title:string,body:string,locale:'fr'|'ar',richDocument?:RichDocument,answers:Record<string,unknown>={},secondary?:SecondaryDocumentSection):Promise<Buffer>{
 const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH;if(!executablePath)throw new Error('PDF_RENDERER_NOT_CONFIGURED');
 const browser=await puppeteer.launch({executablePath,headless:true,timeout:20000,args:['--disable-dev-shm-usage',...(process.env.RENDER_CHROMIUM_NO_SANDBOX==='true'?['--no-sandbox']:[])]});
 try{const page=await browser.newPage();await page.setJavaScriptEnabled(false);await page.setRequestInterception(true);page.on('request',r=>{void r.abort();});await page.setContent(documentHtml(title,body,locale,richDocument,answers,secondary),{waitUntil:'domcontentloaded',timeout:15000});return Buffer.from(await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,timeout:30000}));}
 finally{await browser.close();}
}
