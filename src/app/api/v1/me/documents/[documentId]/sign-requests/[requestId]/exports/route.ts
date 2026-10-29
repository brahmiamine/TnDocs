import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody,requireSameOrigin } from "@/modules/identity/http";
import { enqueueRegenerableExport } from "@/platform/jobs/queue";
import { getSignatureEvidence,noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
export async function POST(request:Request,{params}:{params:Promise<{documentId:string;requestId:string}>}) {
 const origin=requireSameOrigin(request);if(origin)return origin;const user=await getCurrentUser();if(!user)return NextResponse.json({code:"UNAUTHENTICATED"},{status:401,headers:noStore});
 const parsed=z.object({format:z.enum(["pdf","docx"])}).safeParse(await readJsonBody(request,1024));if(!parsed.success)return NextResponse.json({code:"INVALID_INPUT"},{status:400,headers:noStore});
 try{const {documentId,requestId}=await params;const evidence=await getSignatureEvidence(user.id,documentId,requestId);if(parsed.data.format==="pdf"&&!process.env.CHROMIUM_EXECUTABLE_PATH)return NextResponse.json({code:"PDF_NOT_CONFIGURED"},{status:503,headers:noStore});const job=await enqueueRegenerableExport({kind:"signature.export",ownerUserId:user.id,key:`signed-export:${user.id}:${requestId}:${parsed.data.format}:${evidence.contentHash}`,payload:{documentId,requestId,format:parsed.data.format}});return NextResponse.json({jobId:job.id,status:job.status},{status:202,headers:noStore});}catch(error){return signatureFailure(error);}
}
