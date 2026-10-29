import { AlignmentType, Document, Packer, Paragraph, TextRun, type Table } from "docx";
import {richDocumentDocxBlocks} from "./rich-document-docx";
import {renderTemplateText} from "./form-schema";
import type {RichDocument} from "./rich-document";
import type {SecondaryDocumentSection} from "./schema";

/** A shared controlled block set also used by signature exports. Plain body has already been resolved by the caller. */
export function documentDocxSection(title:string,body:string,locale:"fr"|"ar",richDocument?:RichDocument,answers:Record<string,unknown>={},pageBreakBefore=false):Array<Paragraph|Table>{
 const rtl=locale==="ar";
 const paragraphs=richDocument?richDocumentDocxBlocks(richDocument,answers,locale):body.split(/\r?\n/).map(line=>new Paragraph({bidirectional:rtl,alignment:rtl?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:180,line:360},children:[new TextRun({text:line||" ",rightToLeft:rtl,font:"Arial",size:24})]}));
 return [new Paragraph({bidirectional:rtl,alignment:AlignmentType.CENTER,pageBreakBefore,spacing:{after:360},heading:"Heading1",children:[new TextRun({text:title,bold:true,rightToLeft:rtl,font:"Arial",size:32})]}),...paragraphs];
}
export async function renderDocumentDocx(title:string,body:string,locale:"fr"|"ar",richDocument?:RichDocument,answers:Record<string,unknown>={},secondary?:SecondaryDocumentSection){
 if(secondary?.locale===locale)throw new Error("INVALID_BILINGUAL_SECTIONS");
 const children=documentDocxSection(title,body,locale,richDocument,answers);
 if(secondary)children.push(...documentDocxSection(secondary.title??title,renderTemplateText(secondary.body,answers),secondary.locale,secondary.richDocument,answers,true));
 return Packer.toBuffer(new Document({title,styles:{default:{document:{run:{font:"Arial",size:24}}}},sections:[{properties:{page:{margin:{top:1440,right:1440,bottom:1440,left:1440}}},children}]}));
}
