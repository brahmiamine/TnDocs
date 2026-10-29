import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { decideSignature, noStore } from "@/modules/signatures/service";
import { signaturePlacementSchema } from "@/modules/signatures/placement";
import { signatureFailure } from "@/modules/signatures/http";
const schema=z.object({decision:z.enum(["signed","declined"]),contentHash:z.string().regex(/^[a-f0-9]{64}$/),signaturePng:z.string().max(350000).optional(),consent:z.literal(true),placement:signaturePlacementSchema.optional(),kind:z.enum(["signature","stamp"]).optional(),assetId:z.string().uuid().optional(),reuseConfirmed:z.boolean().optional()});
export async function POST(request:Request) {
  const origin=requireSameOrigin(request); if(origin) return origin;
  const parsed=schema.safeParse(await readJsonBody(request,360000));
  if(!parsed.success) return NextResponse.json({code:"INVALID_INPUT"},{status:400,headers:noStore});
  try { await decideSignature(parsed.data); return NextResponse.json({recorded:true},{headers:noStore}); } catch(error) { return signatureFailure(error); }
}
