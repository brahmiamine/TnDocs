import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/modules/identity/service';
import {readJsonBody,requireSameOrigin} from '@/modules/identity/http';
import {loadExportDocument} from '@/modules/documents/export-service';
import {enqueueRegenerableExport} from '@/platform/jobs/queue';
export async function POST(request:Request,{params}:{params:Promise<{documentId:string}>}){
 const origin=requireSameOrigin(request);if(origin)return origin;const user=await getCurrentUser();if(!user)return NextResponse.json({code:'UNAUTHENTICATED'},{status:401});
 const parsed=z.object({format:z.enum(['pdf','docx'])}).strict().safeParse(await readJsonBody(request));if(!parsed.success)return NextResponse.json({code:'INVALID_INPUT'},{status:400});
 const {documentId}=await params;
 try {const data=await loadExportDocument(user.id,documentId);const format=parsed.data.format;
 if(format==='pdf'&&!process.env.CHROMIUM_EXECUTABLE_PATH)return NextResponse.json({code:'PDF_NOT_CONFIGURED'},{status:503});
 const job=await enqueueRegenerableExport({kind:'document.export',ownerUserId:user.id,key:`export:${user.id}:${documentId}:${data.revision.revision}:${format}`,payload:{documentId,revision:data.revision.revision,format}});
 return NextResponse.json({jobId:job.id,status:job.status},{status:202,headers:{'Cache-Control':'private, no-store'}});
 }catch(error){const code=error instanceof Error?error.message:'EXPORT_UNAVAILABLE';return NextResponse.json({code:['NOT_FOUND','OFFICIAL_SOURCE_ONLY','INVALID_ANSWERS'].includes(code)?code:'EXPORT_UNAVAILABLE'},{status:code==='NOT_FOUND'?404:code==='INVALID_ANSWERS'||code==='OFFICIAL_SOURCE_ONLY'?409:503});}
}
