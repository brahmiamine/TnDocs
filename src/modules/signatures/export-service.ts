import {reserveArtifact,writeReservedArtifact} from "@/platform/jobs/artifacts";
import { randomUUID } from "node:crypto";
import { getSignatureEvidence } from "./service";
import { applySignatureOverlays,attachSignatureEvidence,renderSignedDocx } from "./artifacts";
import { renderDocumentPdf } from "@/modules/documents/pdf-renderer";
import { encryptDocumentData } from "@/modules/documents/crypto";
import { attachmentStorageKey,writeEncryptedAttachment } from "@/modules/dossiers/file-storage";
export async function renderSignedSignatureArtifact(ownerId:string,documentId:string,requestId:string,format:"pdf"|"docx") {
  const evidence=await getSignatureEvidence(ownerId,documentId,requestId);
  const output=format==="pdf"?await attachSignatureEvidence(await applySignatureOverlays(await renderDocumentPdf(evidence.content.title??"TnDocs",evidence.renderedBody,evidence.content.locale,evidence.content.richDocument,evidence.answers??evidence.content.answers??{},evidence.content.secondary),evidence.overlays),evidence):await renderSignedDocx(evidence);
  return {output,mimeType:format==="pdf"?"application/pdf":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",revision:evidence.revision};
}
export async function performSignatureExport(job:{id:string;leaseToken:string;ownerUserId:string|null;payload:Record<string,unknown>}) {
  const {documentId,requestId,format}=job.payload;
  if(!job.ownerUserId||typeof documentId!=="string"||typeof requestId!=="string"||(format!=="pdf"&&format!=="docx"))throw new Error("INVALID_JOB");
  const {output,revision}=await renderSignedSignatureArtifact(job.ownerUserId,documentId,requestId,format);
  const encrypted=encryptDocumentData({data:output.toString("base64")},job.ownerUserId,job.id,revision),storageKey=attachmentStorageKey(job.ownerUserId,randomUUID());
  await reserveArtifact(job,storageKey);
 await writeReservedArtifact(job,storageKey,()=>writeEncryptedAttachment(storageKey,Buffer.from(encrypted.ciphertext)));
  return {storageKey,format,revision,documentId,requestId,bytes:output.length};
}
