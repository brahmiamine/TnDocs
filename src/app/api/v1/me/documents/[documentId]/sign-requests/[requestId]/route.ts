import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { revokeSignRequest, noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
export async function DELETE(request:Request,{params}:{params:Promise<{documentId:string;requestId:string}>}) {
  const origin=requireSameOrigin(request); if(origin) return origin;
  const user=await getCurrentUser(); if(!user) return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});
  const {documentId,requestId}=await params;
  try { await revokeSignRequest(user.id,documentId,requestId); return NextResponse.json({revoked:true},{headers:noStore}); } catch(error) { return signatureFailure(error); }
}
