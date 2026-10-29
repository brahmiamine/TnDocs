import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { AlignmentType, Document, Packer, Paragraph, TextRun, ImageRun, Table } from "docx";
import { signaturePlacementSchema, toPdfRectangle, type SignatureOverlay } from "./placement";
import type { RichDocument } from "@/modules/documents/rich-document";
import { documentDocxSection } from "@/modules/documents/docx-renderer";
import { renderTemplateText } from "@/modules/documents/form-schema";
import type { SecondaryDocumentSection } from "@/modules/documents/schema";
import { validateSignaturePng } from "./protocol";
export async function applySignatureOverlays(pdf:Buffer,overlays:SignatureOverlay[]):Promise<Buffer>{
  const document=await PDFDocument.load(pdf);
  for(const overlay of overlays){
    signaturePlacementSchema.parse(overlay);
    if(overlay.page>document.getPageCount())throw new Error("SIGNATURE_PAGE_OUT_OF_RANGE");
    const bytes=Buffer.from(overlay.png.slice("data:image/png;base64,".length),"base64");validateSignaturePng(bytes);
    const image=await document.embedPng(bytes),page=document.getPage(overlay.page-1);
    const rectangle=toPdfRectangle(overlay,page.getWidth(),page.getHeight());
    page.drawImage(image,rectangle);
  }
  return Buffer.from(await document.save());
}
export type SignedArtifactEvidence={requestId:string;documentId:string;revision:number;contentHash:string;createdAt:Date;revokedAt:Date|null;renderedBody:string;content:{title?:string;body:string;locale:"fr"|"ar";richDocument?:RichDocument;answers?:Record<string,unknown>;secondary?:SecondaryDocumentSection};answers?:Record<string,unknown>;participants:Array<{id:string;email:string;status:string;signedAt:Date|null}>;overlays:SignatureOverlay[]};
export async function attachSignatureEvidence(pdf:Buffer,evidence:SignedArtifactEvidence){
  const document=await PDFDocument.load(pdf);
  document.setTitle(evidence.content.title??"TnDocs");document.setSubject("Technical signature evidence. Not a qualified electronic signature.");
  document.setCreationDate(evidence.createdAt);
  document.setModificationDate(new Date(Math.max(evidence.createdAt.getTime(),...evidence.overlays.map(overlay=>overlay.signedAt.getTime()))));
  await document.attach(Buffer.from(JSON.stringify({...evidence,overlays:evidence.overlays.map(({png,...overlay})=>({...overlay,pngSha256:createHash("sha256").update(Buffer.from(png.slice(22),"base64")).digest("hex"),pngIncludedInPage:true})),legalNotice:"Image signatures are not qualified electronic signatures."},null,2)),"signature-evidence.json",{mimeType:"application/json",description:"Revision-bound signature audit evidence"});
  return Buffer.from(await document.save());
}
export async function renderSignedDocx(evidence:SignedArtifactEvidence):Promise<Buffer>{
  const {content}=evidence,rtl=content.locale==="ar";
  const text=(value:string)=>new Paragraph({bidirectional:rtl,alignment:rtl?AlignmentType.RIGHT:AlignmentType.LEFT,spacing:{after:180,line:360},children:[new TextRun({text:value||" ",font:"Arial",size:24,rightToLeft:rtl})]});
  const children:Array<Paragraph|Table>=[...documentDocxSection(content.title??"TnDocs",evidence.renderedBody,content.locale,content.richDocument,evidence.answers??content.answers??{}),...(content.secondary?documentDocxSection(content.secondary.title??content.title??"TnDocs",renderTemplateText(content.secondary.body,evidence.answers??content.answers??{}),content.secondary.locale,content.secondary.richDocument,evidence.answers??content.answers??{},true):[]),new Paragraph({pageBreakBefore:true,heading:"Heading1",bidirectional:rtl,children:[new TextRun({text:rtl?"أدلة التوقيع التقنية":"Preuves techniques de signature",rightToLeft:rtl})]}),text(rtl?"صور التوقيع ليست توقيعاً إلكترونياً مؤهلاً. الصور أدناه مرتبطة بالنسخة المحددة؛ مواضع PDF قد تختلف عن DOCX.":"Les images de signature ne sont pas des signatures électroniques qualifiées. Elles sont liées à la révision ci-dessous. La disposition DOCX diffère des emplacements PDF."),text(`Revision ${evidence.revision} · SHA-256 ${evidence.contentHash}`),text(`Request ${evidence.requestId}`)];
  for(const participant of evidence.participants){children.push(text(`${participant.email} · ${participant.status}${participant.signedAt?` · ${participant.signedAt.toISOString()}`:""}`));const overlay=evidence.overlays.find(value=>value.participantId===participant.id);if(overlay){const bytes=Buffer.from(overlay.png.slice(22),"base64");const dimensions=validateSignaturePng(bytes);children.push(new Paragraph({children:[new ImageRun({type:"png",data:bytes,transformation:{width:240,height:240*dimensions.height/dimensions.width}})]}),text(`PDF page ${overlay.page}; x=${overlay.x}, y=${overlay.y}, width=${overlay.width}, height=${overlay.height}`));}}
  const document=new Document({title:content.title,creator:"TnDocs",description:"Revision-bound technical signature evidence; not qualified e-signature",sections:[{properties:{page:{margin:{top:1440,right:1440,bottom:1440,left:1440}}},children}]});
  return Packer.toBuffer(document);
}
