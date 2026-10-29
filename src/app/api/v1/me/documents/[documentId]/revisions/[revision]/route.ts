import { and,eq,ne } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { documentRevisions,personalDocuments } from "@/platform/database/schema";
import { decryptDocumentData } from "@/modules/documents/crypto";
import { documentContentSchema } from "@/modules/documents/schema";
import { privateTemplateAccess,privateJson,privateError } from "@/modules/private-templates/http";
export async function GET(_request:Request,{params}:{params:Promise<{documentId:string;revision:string}>}){
 const {user,response}=await privateTemplateAccess();if(response)return response;const {documentId,revision}=await params;const number=Number(revision);if(!Number.isSafeInteger(number)||number<1)return privateError("INVALID_INPUT",400);
 try{const [row]=await database!.select({revision:documentRevisions}).from(documentRevisions).innerJoin(personalDocuments,eq(personalDocuments.id,documentRevisions.documentId)).where(and(eq(personalDocuments.ownerUserId,user.id),eq(personalDocuments.id,documentId),ne(personalDocuments.status,"trash"),eq(documentRevisions.revision,number))).limit(1);if(!row)return privateError("NOT_FOUND",404);const content=documentContentSchema.parse(decryptDocumentData(row.revision.contentCiphertext,row.revision.encryptionKeyVersion,user.id,documentId,number));return privateJson({revision:number,createdAt:row.revision.createdAt,content});}catch{return privateError("DOCUMENT_UNAVAILABLE",503);}
}