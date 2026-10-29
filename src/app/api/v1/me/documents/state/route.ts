import { and,desc,eq,like,ne } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { personalDocuments } from "@/platform/database/schema";
import { documentStateMetadata } from "@/modules/document-state/db-schema";
import { privateTemplateAccess,privateJson,privateError } from "@/modules/private-templates/http";
export async function GET(request:Request){
 const {user,response}=await privateTemplateAccess();if(response)return response;
 const query=new URL(request.url).searchParams;const offset=Number(query.get("offset")??0);const status=query.get("status")??"all";const q=(query.get("q")??"").trim();const favorites=query.get("favorites")==="true";
 if(!Number.isSafeInteger(offset)||offset<0||offset>1_000_000||!["all","draft","finalized","archived","trash"].includes(status)||q.length>240)return privateError("INVALID_INPUT",400);
 try{const rows=await database!.select({id:personalDocuments.id,title:personalDocuments.title,status:personalDocuments.status,currentRevision:personalDocuments.currentRevision,updatedAt:personalDocuments.updatedAt,favorite:documentStateMetadata.favorite}).from(personalDocuments).leftJoin(documentStateMetadata,eq(documentStateMetadata.documentId,personalDocuments.id)).where(and(eq(personalDocuments.ownerUserId,user.id),status==="all"?ne(personalDocuments.status,"trash"):eq(personalDocuments.status,status as "draft"|"finalized"|"archived"|"trash"),favorites?eq(documentStateMetadata.favorite,1):undefined,q?like(personalDocuments.title,`%${q.replace(/[\\%_]/g,"\\$&")}%`):undefined)).orderBy(desc(personalDocuments.updatedAt),desc(personalDocuments.id)).limit(101).offset(offset);return privateJson({documents:rows.slice(0,100).map(row=>({...row,favorite:row.favorite===1})),nextOffset:rows.length>100?offset+100:null});}catch{return privateError("DOCUMENT_UNAVAILABLE",503);}
}
