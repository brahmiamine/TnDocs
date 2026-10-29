import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { verifySignatureRecipient, signatureCookieName, noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
const schema=z.object({token:z.string().regex(/^[a-zA-Z0-9_-]{43}$/)});
export async function POST(request:Request) {
  const origin=requireSameOrigin(request); if(origin) return origin;
  const parsed=schema.safeParse(await readJsonBody(request,1024));
  if(!parsed.success) return NextResponse.json({code:"INVALID_INPUT"},{status:400,headers:noStore});
  try { const token=await verifySignatureRecipient(parsed.data.token); const response=NextResponse.json({verified:true},{headers:noStore}); response.cookies.set(signatureCookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:1800}); return response; } catch(error) { return signatureFailure(error); }
}
