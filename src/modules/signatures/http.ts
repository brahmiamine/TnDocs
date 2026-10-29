import { NextResponse } from "next/server";
import { SignatureError, noStore } from "./service";
export function signatureFailure(error:unknown) {
  if(error instanceof Error && error.message==="STORAGE_QUOTA_EXCEEDED") return NextResponse.json({code:"STORAGE_QUOTA_EXCEEDED"},{status:413,headers:noStore});
  if(error instanceof SignatureError) return NextResponse.json({code:error.code},{status:error.status,headers:noStore});
  return NextResponse.json({code:"SIGNATURE_SERVICE_UNAVAILABLE"},{status:503,headers:noStore});
}
