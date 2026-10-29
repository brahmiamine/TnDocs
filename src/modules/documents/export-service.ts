import {reserveArtifact,writeReservedArtifact} from "@/platform/jobs/artifacts";
import { randomUUID } from 'node:crypto';
import { getPrivateDocumentDefinition } from '@/modules/private-templates/service';
import { and, eq } from 'drizzle-orm';
import { database } from '@/platform/database/client';
import {personalDocuments,documentRevisions,catalogTemplates,catalogTemplateVersions} from '@/platform/database/schema';
import { decryptDocumentData, encryptDocumentData } from './crypto';
import { documentContentSchema } from './schema';
import { parseFormSchema, renderTemplateText, validateFormAnswers, resolveFormAnswers } from './form-schema';
import { renderDocumentDocx } from './docx-renderer';
import { renderDocumentPdf } from './pdf-renderer';
import {attachmentStorageKey,writeEncryptedAttachment} from '@/modules/dossiers/file-storage';

export async function loadExportDocument(ownerId:string,documentId:string,revisionNumber?:number){
 if(!database)throw new Error('SERVICE_UNAVAILABLE');
 const [doc]=await database.select().from(personalDocuments).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,ownerId))).limit(1);
 if(!doc||doc.status==='trash')throw new Error('NOT_FOUND');
 const [template]=doc.templateId?await database.select().from(catalogTemplates).where(eq(catalogTemplates.id,doc.templateId)).limit(1):[];
 if(template?.documentType==='official')throw new Error('OFFICIAL_SOURCE_ONLY');
 const [revision]=await database.select().from(documentRevisions).where(and(eq(documentRevisions.documentId,doc.id),eq(documentRevisions.revision,revisionNumber??doc.currentRevision))).limit(1);
 if(!revision)throw new Error('NOT_FOUND');
 const content=documentContentSchema.parse(decryptDocumentData(revision.contentCiphertext,revision.encryptionKeyVersion,ownerId,doc.id,revision.revision));
 const [version]=doc.templateVersionId?await database.select().from(catalogTemplateVersions).where(eq(catalogTemplateVersions.id,doc.templateVersionId)).limit(1):[];
 const privateModel = await getPrivateDocumentDefinition(doc.id, ownerId);
 const schema=parseFormSchema(version?.formSchema??privateModel?.formSchema??null);
 if(version?.formSchema&&!schema)throw new Error('INVALID_SCHEMA');
 if(!validateFormAnswers(schema,content.answers))throw new Error('INVALID_ANSWERS');
 return {doc,revision,content,answers:resolveFormAnswers(schema,content.answers),body:renderTemplateText(content.body,resolveFormAnswers(schema,content.answers))};
}
export async function performDocumentExport(job:{id:string;leaseToken:string;ownerUserId:string|null;payload:Record<string,unknown>}){
 const {documentId,revision,format}=job.payload;
 if(!job.ownerUserId||typeof documentId!=='string'||typeof revision!=='number'||(format!=='pdf'&&format!=='docx'))throw new Error('INVALID_JOB');
 const data=await loadExportDocument(job.ownerUserId,documentId,revision);
 const output=format==='pdf'?await renderDocumentPdf(data.content.title??data.doc.title,data.body,data.content.locale,data.content.richDocument,data.answers,data.content.secondary):await renderDocumentDocx(data.content.title??data.doc.title,data.body,data.content.locale,data.content.richDocument,data.answers,data.content.secondary);
 const encrypted=encryptDocumentData({data:output.toString('base64')},job.ownerUserId,job.id,revision);
 const storageKey=attachmentStorageKey(job.ownerUserId,randomUUID());
 await reserveArtifact(job,storageKey);
 await writeReservedArtifact(job,storageKey,()=>writeEncryptedAttachment(storageKey,Buffer.from(encrypted.ciphertext)));
 return {storageKey,format,revision,documentId,bytes:output.length};
}
