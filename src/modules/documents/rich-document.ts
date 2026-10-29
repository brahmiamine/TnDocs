import { z } from "zod";
import { renderTemplateText } from "./form-schema";
const runSchema=z.object({text:z.string().max(10000),bold:z.boolean().optional(),italic:z.boolean().optional(),underline:z.boolean().optional()}).strict();
const inline=z.array(runSchema).min(1).max(80),direction=z.enum(["auto","ltr","rtl"]),alignment=z.enum(["start","center","end"]);
const paragraph=z.object({type:z.literal("paragraph"),children:inline,direction:direction.optional(),align:alignment.optional()}).strict();
const heading=z.object({type:z.literal("heading"),level:z.union([z.literal(1),z.literal(2),z.literal(3)]),children:inline,direction:direction.optional(),align:alignment.optional()}).strict();
const list=z.object({type:z.literal("list"),ordered:z.boolean(),items:z.array(z.object({children:inline}).strict()).min(1).max(100),direction:direction.optional()}).strict();
const table=z.object({type:z.literal("table"),rows:z.array(z.object({cells:z.array(z.object({children:inline}).strict()).min(1).max(12)}).strict()).min(1).max(50),direction:direction.optional()}).strict().refine(value=>value.rows.every(row=>row.cells.length===value.rows[0].cells.length),{message:"Table rows must have identical column counts"});
const pageBreak=z.object({type:z.literal("pageBreak")}).strict();
const blockSchema=z.union([paragraph,heading,list,table,pageBreak]);
export const richDocumentSchema=z.object({version:z.literal(1),blocks:z.array(blockSchema).max(200)}).strict().superRefine((document,context)=>{
 let characters=0;
 for(const block of document.blocks){
   const groups=block.type==="paragraph"||block.type==="heading"?[block.children]:block.type==="list"?block.items.map(item=>item.children):block.type==="table"?block.rows.flatMap(row=>row.cells.map(cell=>cell.children)):[];
   for(const runs of groups)for(const run of runs)characters+=run.text.length;
 }
 if(characters>50000)context.addIssue({code:"custom",path:["blocks"],message:"Document text exceeds 50000 characters"});
});
export type RichDocument=z.infer<typeof richDocumentSchema>;
export type RichBlock=RichDocument["blocks"][number];
export type RichRun=z.infer<typeof runSchema>;
export function richDocumentFromText(text:string):RichDocument{
 const lines=text.split(/\r?\n/);
 const runs=(value:string)=>{const chunks:RichRun[]=[];for(let index=0;index<value.length;index+=10000)chunks.push({text:value.slice(index,index+10000)});return chunks.length?chunks:[{text:""}];};
 return richDocumentSchema.parse({version:1,blocks:lines.length<=200?lines.map(line=>({type:"paragraph",children:runs(line)})):[{type:"paragraph",children:runs(text.replace(/\r\n/g,"\n"))}]});
}
const escape=(text:string)=>text.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
/** Expand a variable once even if its token crosses styled inline boundaries. The replacement inherits its opening segment's style. */
export function resolveRichRuns(runs:RichRun[],answers?:Record<string,unknown>):RichRun[]{
 if(answers===undefined)return runs;
 const source=runs.map(run=>run.text).join(""),starts:number[]=[];let offset=0;
 for(const run of runs){starts.push(offset);offset+=run.text.length;}
 const result:RichRun[]=[];
 function appendRange(start:number,end:number){for(let index=0;index<runs.length;index++){const runStart=starts[index],runEnd=runStart+runs[index].text.length;if(runEnd<=start||runStart>=end)continue;result.push({...runs[index],text:runs[index].text.slice(Math.max(0,start-runStart),Math.min(runs[index].text.length,end-runStart))});}}
 let cursor=0;
 for(const match of source.matchAll(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/g)){
  const position=match.index!;appendRange(cursor,position);
  const styleIndex=starts.findIndex((start,index)=>start<=position&&start+runs[index].text.length>position);
  result.push({...runs[Math.max(0,styleIndex)],text:renderTemplateText(match[0],answers)});cursor=position+match[0].length;
 }
 appendRange(cursor,source.length);
 const merged:RichRun[]=[];
 for(const run of result){const previous=merged[merged.length-1];if(previous&&!!previous.bold===!!run.bold&&!!previous.italic===!!run.italic&&!!previous.underline===!!run.underline)previous.text+=run.text;else merged.push({...run});}
 return merged.length?merged:[{text:""}];
}
function rendered(runs:RichRun[],answers:Record<string,unknown>|undefined){return resolveRichRuns(runs,answers).map(run=>run.text).join("");}
export function richDocumentText(value:RichDocument,answers?:Record<string,unknown>):string{
 const document=richDocumentSchema.parse(value);
 return document.blocks.map(block=>block.type==="pageBreak"?"\n":block.type==="paragraph"||block.type==="heading"?rendered(block.children,answers):block.type==="list"?block.items.map((item,index)=>`${block.ordered?`${index+1}.`:"•"} ${rendered(item.children,answers)}`).join("\n"):block.rows.map(row=>row.cells.map(cell=>rendered(cell.children,answers)).join("\t")).join("\n")).join("\n");
}
export function richDocumentHtml(value:RichDocument,answers:Record<string,unknown>={},locale:"fr"|"ar"="fr"){
 const document=richDocumentSchema.parse(value),defaultDir=locale==="ar"?"rtl":"ltr";
 function html(runs:RichRun[]){return resolveRichRuns(runs,answers).map(run=>{let text=escape(run.text);if(run.bold)text=`<strong>${text}</strong>`;if(run.italic)text=`<em>${text}</em>`;if(run.underline)text=`<u>${text}</u>`;return text;}).join("")||"&#160;";}
 return document.blocks.map(block=>{
  if(block.type==="pageBreak")return '<div style="break-before:page"></div>';
  const dir=block.direction&&block.direction!=="auto"?block.direction:defaultDir;
  if(block.type==="paragraph"||block.type==="heading"){const tag=block.type==="heading"?`h${block.level}`:"p";return `<${tag} dir="${dir}" style="text-align:${block.align??"start"};white-space:pre-wrap">${html(block.children)}</${tag}>`;}
  if(block.type==="list"){const tag=block.ordered?"ol":"ul";return `<${tag} dir="${dir}">${block.items.map(item=>`<li>${html(item.children)}</li>`).join("")}</${tag}>`;}
  return `<table dir="${dir}" style="width:100%;border-collapse:collapse;table-layout:fixed">${block.rows.map(row=>`<tr>${row.cells.map(cell=>`<td style="border:1px solid #777;padding:8px;white-space:pre-wrap;overflow-wrap:anywhere">${html(cell.children)}</td>`).join("")}</tr>`).join("")}</table>`;
 }).join("");
}
