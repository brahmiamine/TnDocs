import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/modules/identity/service';
import {loadExportDocument} from '@/modules/documents/export-service';
import {renderDocumentDocx} from '@/modules/documents/docx-renderer';
/** Compatibility download: shares the same pinned validation/renderer as queued exports. */
export async function GET(_request:Request,{params}:{params:Promise<{documentId:string}>}){
 const user=await getCurrentUser();if(!user)return NextResponse.json({code:'UNAUTHENTICATED'},{status:401});const {documentId}=await params;
 try{const data=await loadExportDocument(user.id,documentId);const output=await renderDocumentDocx(data.content.title??data.doc.title,data.body,data.content.locale,data.content.richDocument,data.answers,data.content.secondary);return new Response(new Uint8Array(output),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Content-Disposition':`attachment; filename="tndocs-${documentId}.docx"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){const code=error instanceof Error?error.message:'';return NextResponse.json({code:['NOT_FOUND','INVALID_ANSWERS','OFFICIAL_SOURCE_ONLY'].includes(code)?code:'EXPORT_UNAVAILABLE'},{status:code==='NOT_FOUND'?404:['INVALID_ANSWERS','OFFICIAL_SOURCE_ONLY'].includes(code)?409:503});}
}
