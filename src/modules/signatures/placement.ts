import { z } from "zod";
/** Coordinates use the PDF page from its top left; ratios are independent of render DPI. */
export const signaturePlacementSchema=z.object({
  page:z.number().int().min(1).max(1000),
  x:z.number().min(0).max(1),y:z.number().min(0).max(1),
  width:z.number().positive().max(1),height:z.number().positive().max(1),
}).refine(value=>value.x+value.width<=1&&value.y+value.height<=1,{message:"Signature must fit entirely on its page"});
export type SignaturePlacement=z.infer<typeof signaturePlacementSchema>;
export type SignatureOverlay=SignaturePlacement&{participantId:string;png:string;kind:"signature"|"stamp";signedAt:Date;contentHash:string};
export function toPdfRectangle(placement:SignaturePlacement,pageWidth:number,pageHeight:number){
  const parsed=signaturePlacementSchema.parse(placement);
  return {x:parsed.x*pageWidth,y:(1-parsed.y-parsed.height)*pageHeight,width:parsed.width*pageWidth,height:parsed.height*pageHeight};
}
