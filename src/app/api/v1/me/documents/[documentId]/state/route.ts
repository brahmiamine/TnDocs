import { readJsonBody } from "@/modules/identity/http";
import { stateCommandSchema } from "@/modules/document-state/policy";
import { changeDocumentState } from "@/modules/document-state/service";
import { privateTemplateAccess,privateJson,privateError } from "@/modules/private-templates/http";
export async function POST(request:Request,{params}:{params:Promise<{documentId:string}>}){
 const {user,response}=await privateTemplateAccess(request);if(response)return response;
 const parsed=stateCommandSchema.safeParse(await readJsonBody(request,8192));if(!parsed.success)return privateError("INVALID_INPUT",400);
 const {documentId}=await params;
 try{const result=await changeDocumentState(user.id,documentId,parsed.data);return result?privateJson(result):privateError("NOT_FOUND",404);}catch(error){
  const code=error instanceof Error?error.message:"";
  if(["INVALID_STATE","REVISION_CONFLICT","INVALID_ANSWERS","OFFICIAL_SOURCE_ONLY","TRASH_RETENTION_EXPIRED"].includes(code))return privateError(code,409);
  return privateError(code==="STORAGE_QUOTA_EXCEEDED"?code:"DOCUMENT_UNAVAILABLE",code==="STORAGE_QUOTA_EXCEEDED"?413:503);
 }
}
export async function GET(request:Request,{params}:{params:Promise<{documentId:string}>}){
 const {user,response}=await privateTemplateAccess();if(response)return response;const {documentId}=await params;
 const offset=Number(new URL(request.url).searchParams.get("offset")??0);if(!Number.isSafeInteger(offset)||offset<0)return privateError("INVALID_INPUT",400);
 try{const {database}=await import("@/platform/database/client");const {documentRevisions,personalDocuments}=await import("@/platform/database/schema");const {and,desc,eq,ne}=await import("drizzle-orm");
 const [document]=await database!.select({id:personalDocuments.id,currentRevision:personalDocuments.currentRevision,status:personalDocuments.status}).from(personalDocuments).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,user.id),ne(personalDocuments.status,"trash"))).limit(1);if(!document)return privateError("NOT_FOUND",404);
 const revisions=await database!.select({revision:documentRevisions.revision,createdAt:documentRevisions.createdAt}).from(documentRevisions).where(eq(documentRevisions.documentId,documentId)).orderBy(desc(documentRevisions.revision)).limit(101).offset(offset);
 return privateJson({document,revisions:revisions.slice(0,100),nextOffset:revisions.length>100?offset+100:null});
 }catch{return privateError("DOCUMENT_UNAVAILABLE",503);}
}
