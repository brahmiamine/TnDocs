import { markResourceTrashed,clearTrashMarkerForRestore } from "@/platform/retention/trash";
import { randomUUID } from "node:crypto";
import { and,eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { catalogTemplates,catalogTemplateVersions,documentRevisions,personalDocuments } from "@/platform/database/schema";
import { assertStorageQuota,lockStorageOwner } from "@/platform/storage/quota";
import { documentContentSchema,type DocumentContent } from "@/modules/documents/schema";
import { parseFormSchema,validateFormAnswers } from "@/modules/documents/form-schema";
import { decryptDocumentData,encryptDocumentData } from "@/modules/documents/crypto";
import { getPrivateDocumentDefinition } from "@/modules/private-templates/service";
import { documentStateMetadata } from "./db-schema";
import { planDocumentState,type StateCommand } from "./policy";
export async function changeDocumentState(ownerId:string,documentId:string,command:StateCommand){
 if(!database)throw new Error("SERVICE_UNAVAILABLE");
 return database.transaction(async tx=>{
  // Same owner→document lock ordering as all storage writers.
  await lockStorageOwner(tx,ownerId);
  const [document]=await tx.select().from(personalDocuments).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,ownerId))).limit(1).for("update");
  if(!document)return null;
  if(document.currentRevision!==command.expectedRevision)throw new Error("REVISION_CONFLICT");
  const [metadata]=await tx.select().from(documentStateMetadata).where(eq(documentStateMetadata.documentId,documentId)).limit(1);
  const plan=planDocumentState(document.status,command,metadata);
  if(command.action==="trash")await markResourceTrashed(tx,"document",documentId,ownerId);
  if(command.action==="restore")await clearTrashMarkerForRestore(tx,"document",documentId,ownerId);
  let content:DocumentContent|undefined;
  if(plan.newRevision||command.action==="finalize"){
   const [revision]=await tx.select().from(documentRevisions).where(and(eq(documentRevisions.documentId,documentId),eq(documentRevisions.revision,document.currentRevision))).limit(1);
   if(!revision)throw new Error("DOCUMENT_UNAVAILABLE");
   content=documentContentSchema.parse(decryptDocumentData(revision.contentCiphertext,revision.encryptionKeyVersion,ownerId,documentId,revision.revision));
  }
  if(command.action==="finalize"){
   const [version]=document.templateVersionId?await tx.select().from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id,document.templateVersionId)).limit(1):[];
   const privateModel=await getPrivateDocumentDefinition(documentId,ownerId,tx);
   const raw=version?.formSchema??privateModel?.formSchema??null;const schema=parseFormSchema(raw);
   if((raw&&!schema)||!validateFormAnswers(schema,content!.answers))throw new Error("INVALID_ANSWERS");
   const [template]=document.templateId?await tx.select().from(catalogTemplates).where(eq(catalogTemplates.id,document.templateId)).limit(1):[];
   if(template?.documentType==="official")throw new Error("OFFICIAL_SOURCE_ONLY");
  }
  let nextRevision=document.currentRevision;
  const title=command.action==="rename"?command.title:document.title;
  if(plan.newRevision){
   nextRevision++;
   const encrypted=encryptDocumentData({...content,title},ownerId,documentId,nextRevision);
   await assertStorageQuota(tx,ownerId,Buffer.byteLength(encrypted.ciphertext));
   await tx.insert(documentRevisions).values({id:randomUUID(),documentId,revision:nextRevision,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion,createdBy:ownerId});
  }
  const changes={...(plan.preArchiveStatus?{preArchiveStatus:plan.preArchiveStatus}:{}),...(plan.preTrashStatus?{preTrashStatus:plan.preTrashStatus}:{}),...(command.action==="favorite"?{favorite:command.favorite?1:0}:{})};
  await tx.insert(documentStateMetadata).values({documentId,...changes}).onDuplicateKeyUpdate({set:{...changes,updatedAt:new Date()}});
  const [changed]=await tx.update(personalDocuments).set({status:plan.status,title,currentRevision:nextRevision,updatedAt:new Date()}).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,ownerId),eq(personalDocuments.currentRevision,command.expectedRevision)));
  if(!changed.affectedRows)throw new Error("REVISION_CONFLICT");
  return {id:documentId,status:plan.status,revision:nextRevision,title,favorite:command.action==="favorite"?command.favorite:metadata?.favorite===1};
 });
}
