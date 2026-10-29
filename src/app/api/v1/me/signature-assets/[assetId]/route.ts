import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { deleteSignatureAsset } from "@/modules/signatures/assets";
import { noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
export async function DELETE(request:Request,{params}:{params:Promise<{assetId:string}>}){const origin=requireSameOrigin(request);if(origin)return origin;const user=await getCurrentUser();if(!user)return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});try{await deleteSignatureAsset(user.id,(await params).assetId);return NextResponse.json({deleted:true},{headers:noStore});}catch(error){return signatureFailure(error);}}
