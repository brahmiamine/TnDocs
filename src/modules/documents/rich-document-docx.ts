import { AlignmentType,Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType } from "docx";
import { richDocumentSchema,resolveRichRuns,type RichDocument,type RichRun } from "./rich-document";
export function richDocumentDocxBlocks(value:RichDocument,answers:Record<string,unknown>={},locale:"fr"|"ar"="fr"):Array<Paragraph|Table>{
 const document=richDocumentSchema.parse(value),rtl=locale==="ar";
 const runs=(children:RichRun[],isRtl:boolean)=>resolveRichRuns(children,answers).map(run=>new TextRun({text:run.text,bold:run.bold,italics:run.italic,underline:run.underline?{}:undefined,font:"Arial",size:24,rightToLeft:isRtl}));
 return document.blocks.flatMap<Paragraph|Table>(block=>{
  if(block.type==="pageBreak")return [new Paragraph({pageBreakBefore:true,children:[]})];
  const isRtl=block.direction==="rtl"||(block.direction!=="ltr"&&rtl),align=block.type==="paragraph"||block.type==="heading"?block.align:"start",alignment=align==="center"?AlignmentType.CENTER:align==="end"?(isRtl?AlignmentType.LEFT:AlignmentType.RIGHT):(isRtl?AlignmentType.RIGHT:AlignmentType.LEFT);
  if(block.type==="paragraph"||block.type==="heading")return [new Paragraph({bidirectional:isRtl,alignment,spacing:{after:180,line:360},heading:block.type==="heading"?`Heading${block.level}` as "Heading1"|"Heading2"|"Heading3":undefined,children:runs(block.children,isRtl)})];
  if(block.type==="list")return block.items.map((item,index)=>new Paragraph({bidirectional:isRtl,alignment,spacing:{after:120,line:360},children:[new TextRun({text:`${block.ordered?`${index+1}.`:"•"} `,rightToLeft:isRtl}),...runs(item.children,isRtl)]}));
  return [new Table({width:{size:100,type:WidthType.PERCENTAGE},visuallyRightToLeft:isRtl,rows:block.rows.map(row=>new TableRow({children:row.cells.map(cell=>new TableCell({children:[new Paragraph({bidirectional:isRtl,alignment,children:runs(cell.children,isRtl)})]}))}))})];
 });
}
export async function renderRichDocx(title:string,value:RichDocument,answers:Record<string,unknown>={},locale:"fr"|"ar"="fr"){
 const document=new Document({title,styles:{default:{document:{run:{font:"Arial",size:24}}}},sections:[{properties:{page:{margin:{top:1440,right:1440,bottom:1440,left:1440}}},children:[new Paragraph({heading:"Heading1",bidirectional:locale==="ar",children:[new TextRun({text:title,rightToLeft:locale==="ar"})]}),...richDocumentDocxBlocks(value,answers,locale)]}]});return Packer.toBuffer(document);
}
