import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { requestSignatureVerification, noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
const schema=z.object({token:z.string().regex(/^[a-zA-Z0-9_-]{43}$/),locale:z.enum(["fr","ar"])});
export async function POST(request:Request) {
  const origin=requireSameOrigin(request); if(origin) return origin;
  const parsed=schema.safeParse(await readJsonBody(request,1024));
  if(!parsed.success) return NextResponse.json({code:"INVALID_INPUT"},{status:400,headers:noStore});
  try { await requestSignatureVerification(parsed.data.token,parsed.data.locale); return NextResponse.json({message:"If the invitation is active, verification was sent to its recipient."},{status:202,headers:noStore}); } catch(error) { return signatureFailure(error); }
}
