import { assertStorageQuota,lockStorageOwner } from "@/platform/storage/quota";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { catalogTemplates, catalogTemplateTranslations, catalogTemplateVersions, documentRevisions, personalDocuments } from "@/platform/database/schema";
import { encryptDocumentData } from "@/modules/documents/crypto";
import { privateTemplates, privateTemplateVersions, privateDocumentModels } from "./db-schema";
import { type PrivateTemplateBlueprint, decryptPrivateTemplate, encryptPrivateTemplate, decryptPrivateDocumentModel, encryptPrivateDocumentModel, sanitizeReusableTemplate } from "./model";

type Database = NonNullable<typeof database>;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Database | Transaction;
function db() { if (!database) throw new Error("SERVICE_UNAVAILABLE"); return database; }

export async function listPrivateTemplates(ownerId: string) {
  const rows=await db().select({template:privateTemplates,version:privateTemplateVersions}).from(privateTemplates).innerJoin(privateTemplateVersions,and(eq(privateTemplateVersions.templateId,privateTemplates.id),eq(privateTemplateVersions.version,privateTemplates.currentVersion))).where(eq(privateTemplates.ownerUserId,ownerId)).orderBy(desc(privateTemplates.updatedAt));
  return rows.map(({template,version})=>({id:template.id,currentVersion:template.currentVersion,createdAt:template.createdAt,updatedAt:template.updatedAt,...decryptPrivateTemplate(version.contentCiphertext,version.encryptionKeyVersion,ownerId,template.id,version.version)}));
}
export async function getPrivateTemplate(ownerId:string,templateId:string,version?:number) {
  const [template]=await db().select().from(privateTemplates).where(and(eq(privateTemplates.id,templateId),eq(privateTemplates.ownerUserId,ownerId))).limit(1);
  if(!template)return null;
  const [row]=await db().select().from(privateTemplateVersions).where(and(eq(privateTemplateVersions.templateId,templateId),eq(privateTemplateVersions.version,version??template.currentVersion))).limit(1);
  if(!row)return null;
  return {id:template.id,currentVersion:template.currentVersion,version:row.version,createdAt:row.createdAt,blueprint:decryptPrivateTemplate(row.contentCiphertext,row.encryptionKeyVersion,ownerId,templateId,row.version)};
}
export async function createPrivateTemplate(ownerId:string,blueprint:PrivateTemplateBlueprint) {
  const id=randomUUID();const encrypted=encryptPrivateTemplate(blueprint,ownerId,id,1);
  await db().transaction(async tx=>{
    await assertStorageQuota(tx,ownerId,Buffer.byteLength(encrypted.ciphertext));
    await tx.insert(privateTemplates).values({id,ownerUserId:ownerId,currentVersion:1});
    await tx.insert(privateTemplateVersions).values({id:randomUUID(),templateId:id,version:1,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion});
  });
  return {id,currentVersion:1};
}
export async function updatePrivateTemplate(ownerId:string,templateId:string,expectedVersion:number,changes:Partial<PrivateTemplateBlueprint>) {
  const current=await getPrivateTemplate(ownerId,templateId); if(!current)return null;
  if(current.currentVersion!==expectedVersion)throw new Error("REVISION_CONFLICT");
  const blueprint=sanitizeReusableTemplate({...current.blueprint,...changes});const next=expectedVersion+1;const encrypted=encryptPrivateTemplate(blueprint,ownerId,templateId,next);
  await db().transaction(async tx=>{
    await assertStorageQuota(tx,ownerId,Buffer.byteLength(encrypted.ciphertext));
    const [changed]=await tx.update(privateTemplates).set({currentVersion:next}).where(and(eq(privateTemplates.id,templateId),eq(privateTemplates.ownerUserId,ownerId),eq(privateTemplates.currentVersion,expectedVersion)));
    if(!changed.affectedRows)throw new Error("REVISION_CONFLICT");
    await tx.insert(privateTemplateVersions).values({id:randomUUID(),templateId,version:next,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion});
  });return {id:templateId,currentVersion:next};
}
export async function deletePrivateTemplate(ownerId:string,templateId:string) {
  return db().transaction(async tx=>{await lockStorageOwner(tx,ownerId);const [result]=await tx.delete(privateTemplates).where(and(eq(privateTemplates.id,templateId),eq(privateTemplates.ownerUserId,ownerId)));return result.affectedRows>0;});
}
export async function getPrivateDocumentDefinition(documentId:string,ownerId:string,executor:Executor=db()) {
  const [row]=await executor.select({model:privateDocumentModels}).from(privateDocumentModels).innerJoin(personalDocuments,eq(personalDocuments.id,privateDocumentModels.documentId)).where(and(eq(privateDocumentModels.documentId,documentId),eq(personalDocuments.ownerUserId,ownerId))).limit(1);
  return row ? decryptPrivateDocumentModel(row.model.contentCiphertext,row.model.encryptionKeyVersion,ownerId,documentId) : null;
}
/** Must be called inside the transaction which creates the duplicate. */
export async function copyPrivateDocumentDefinition(sourceId:string,targetId:string,ownerId:string,executor?:Transaction):Promise<boolean> {
  if(!executor)return db().transaction(tx=>copyPrivateDocumentDefinition(sourceId,targetId,ownerId,tx));
  const definition=await getPrivateDocumentDefinition(sourceId,ownerId,executor);if(!definition)return false;
  const [source]=await executor.select().from(privateDocumentModels).where(eq(privateDocumentModels.documentId,sourceId)).limit(1);
  const encrypted=encryptPrivateDocumentModel(definition,ownerId,targetId);
  await assertStorageQuota(executor,ownerId,Buffer.byteLength(encrypted.ciphertext));
  await executor.insert(privateDocumentModels).values({documentId:targetId,sourceTemplateId:source.sourceTemplateId,sourceVersion:source.sourceVersion,contentCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion});return true;
}
export async function instantiatePrivateTemplate(ownerId:string,templateId:string) {
  return db().transaction(async tx=>{
    await lockStorageOwner(tx,ownerId);
    // Lock serializes instantiate/delete/update against one immutable selected version.
    const [model]=await tx.select().from(privateTemplates).where(and(eq(privateTemplates.id,templateId),eq(privateTemplates.ownerUserId,ownerId))).limit(1).for("update");
    if(!model)return null;
    const [version]=await tx.select().from(privateTemplateVersions).where(and(eq(privateTemplateVersions.templateId,templateId),eq(privateTemplateVersions.version,model.currentVersion))).limit(1);
    if(!version)throw new Error("SERVICE_UNAVAILABLE");
    const blueprint=decryptPrivateTemplate(version.contentCiphertext,version.encryptionKeyVersion,ownerId,templateId,version.version);
    const documentId=randomUUID();
    const content=encryptDocumentData({title:blueprint.title,locale:blueprint.locale,body:blueprint.body,answers:{}},ownerId,documentId,1);
    const snapshot=encryptPrivateDocumentModel(blueprint,ownerId,documentId);
    await assertStorageQuota(tx,ownerId,Buffer.byteLength(content.ciphertext)+Buffer.byteLength(snapshot.ciphertext));
    await tx.insert(personalDocuments).values({id:documentId,ownerUserId:ownerId,title:blueprint.title,currentRevision:1});
    await tx.insert(documentRevisions).values({id:randomUUID(),documentId,revision:1,contentCiphertext:content.ciphertext,encryptionKeyVersion:content.keyVersion,createdBy:ownerId});
    await tx.insert(privateDocumentModels).values({documentId,sourceTemplateId:templateId,sourceVersion:version.version,contentCiphertext:snapshot.ciphertext,encryptionKeyVersion:snapshot.keyVersion});
    return {id:documentId,revision:1};
  });
}
/** Only the immutable unfilled blueprint is reusable; never read a user's rendered document body or answers here. */
export async function reusableSourceFromDocument(ownerId:string,documentId:string,locale:"fr"|"ar") {
  const [document]=await db().select().from(personalDocuments).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,ownerId))).limit(1);
  if(!document || document.status==="trash")return null;
  const privateModel=await getPrivateDocumentDefinition(documentId,ownerId);if(privateModel)return privateModel;
  if(!document.templateId||!document.templateVersionId)return null;
  const [template]=await db().select().from(catalogTemplates).where(and(eq(catalogTemplates.id,document.templateId),eq(catalogTemplates.documentType,"editable"))).limit(1);if(!template)return null;
  const [source]=await db().select({title:catalogTemplateTranslations.title,body:catalogTemplateTranslations.body,locale:catalogTemplateTranslations.locale,formSchema:catalogTemplateVersions.formSchema}).from(catalogTemplateTranslations).innerJoin(catalogTemplateVersions,eq(catalogTemplateTranslations.versionId,catalogTemplateVersions.id)).where(and(eq(catalogTemplateVersions.id,document.templateVersionId),eq(catalogTemplateTranslations.locale,locale))).limit(1);
  return source?sanitizeReusableTemplate(source):null;
}
