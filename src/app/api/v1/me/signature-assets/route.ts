import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { signatureAssetSchema,createSignatureAsset,listSignatureAssets } from "@/modules/signatures/assets";
import { noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
export async function GET(){const user=await getCurrentUser();if(!user)return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});try{return NextResponse.json({assets:await listSignatureAssets(user.id)},{headers:noStore});}catch(error){return signatureFailure(error);}}
export async function POST(request:Request){const origin=requireSameOrigin(request);if(origin)return origin;const user=await getCurrentUser();if(!user)return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});const parsed=signatureAssetSchema.safeParse(await readJsonBody(request,360000));if(!parsed.success)return NextResponse.json({code:"INVALID_INPUT"},{status:400,headers:noStore});try{return NextResponse.json({asset:await createSignatureAsset(user.id,parsed.data)},{status:201,headers:noStore});}catch(error){return signatureFailure(error);}}
