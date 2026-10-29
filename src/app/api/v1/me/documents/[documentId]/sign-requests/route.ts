import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { createRequestSchema, createSignRequest, listSignRequests, noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
export async function GET(_request:Request,{params}:{params:Promise<{documentId:string}>}) {
  const user=await getCurrentUser(); if(!user) return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});
  try { return NextResponse.json({requests:await listSignRequests(user.id,(await params).documentId)},{headers:noStore}); } catch(error) { return signatureFailure(error); }
}
export async function POST(request:Request,{params}:{params:Promise<{documentId:string}>}) {
  const origin=requireSameOrigin(request); if(origin) return origin;
  const user=await getCurrentUser(); if(!user) return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});
  const parsed=createRequestSchema.safeParse(await readJsonBody(request));
  if(!parsed.success) return NextResponse.json({code:"INVALID_INPUT",fieldErrors:parsed.error.flatten()},{status:400,headers:noStore});
  try { return NextResponse.json({request:await createSignRequest(user.id,(await params).documentId,parsed.data)},{status:201,headers:noStore}); } catch(error) { return signatureFailure(error); }
}
