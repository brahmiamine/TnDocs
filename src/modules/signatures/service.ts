import { and, eq, gt, isNull, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { documentRevisions, personalDocuments } from "@/platform/database/schema";
import { decryptDocumentData, encryptDossierData, decryptDossierData } from "@/modules/documents/crypto";
import { documentContentSchema } from "@/modules/documents/schema";
import { createSecretToken, hashSecretToken } from "@/modules/identity/tokens";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { env } from "@/platform/config/env";
import { signatureEvents, signatureParticipants, signatureRequests } from "./db-schema";
import { signatureDigest, validateSignaturePng } from "./protocol";
import { signaturePlacementSchema, type SignatureOverlay, type SignaturePlacement } from "./placement";
import type { SignedArtifactEvidence } from "./artifacts";
import { getCurrentUser } from "@/modules/identity/service";
import { getSignatureAsset } from "./assets";
import { renderTemplateText } from "@/modules/documents/form-schema";
import { loadExportDocument } from "@/modules/documents/export-service";
import { assertStorageQuota,lockStorageOwner } from "@/platform/storage/quota";
import { enqueueSignatureMail } from "./mailer";
import { isFeatureEnabled } from "@/modules/administration/service";

export class SignatureError extends Error { constructor(public code:string, public status=400) { super(code); } }
export const signatureCookieName = process.env.NODE_ENV==="production" ? "__Host-tndocs_signer" : "tndocs_signer";
const noStore = {"Cache-Control":"private, no-store", "Referrer-Policy":"no-referrer"};
export { noStore };
export const createRequestSchema = z.object({
  expectedRevision:z.number().int().positive(), locale:z.enum(["fr","ar"]),
  expiresAt:z.string().datetime().refine(value=>new Date(value)>new Date(),"Expiration must be in the future"),
  recipients:z.array(z.string().trim().email().max(320)).min(1),
}).superRefine((value,ctx)=>{
  const recipients=value.recipients.map(email=>email.toLowerCase());
  if(new Set(recipients).size!==recipients.length) ctx.addIssue({code:"custom",path:["recipients"],message:"Duplicate recipients"});
});
function db() { if(!database) throw new SignatureError("SERVICE_UNAVAILABLE",503); return database; }
function ensureMailer() { if(!env.SMTP_HOST) throw new SignatureError("SMTP_UNAVAILABLE",503); }
export async function createSignRequest(ownerId:string,documentId:string,input:z.infer<typeof createRequestSchema>) {
  if(!await isFeatureEnabled("signatures"))throw new SignatureError("FEATURE_DISABLED",503);
  ensureMailer();
  const rate=Number(process.env.SIGNATURE_REQUESTS_PER_HOUR??20);
  if(await isRateLimited(hashSecretToken(`signature-create:${ownerId}`),Number.isInteger(rate)&&rate>0?rate:20,60*60*1000))throw new SignatureError("RATE_LIMITED",429);
  // Refuse official originals and incomplete required answers before invitations.
  await loadExportDocument(ownerId,documentId,input.expectedRevision);
  const requestId=randomUUID(), expiresAt=new Date(input.expiresAt);
  // Timestamp is MariaDB TIMESTAMP; refuse dates beyond its representable range.
  if(expiresAt.getTime()>2147483647000) throw new SignatureError("EXPIRATION_OUT_OF_RANGE");
  const recipients=input.recipients.map(address=>({id:randomUUID(),email:address.toLowerCase(),secret:createSecretToken()}));
  const contentHash=await db().transaction(async tx=>{
    await lockStorageOwner(tx,ownerId);
    const [document]=await tx.select().from(personalDocuments).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,ownerId))).for("update").limit(1);
    if(!document || document.status==="trash") throw new SignatureError("NOT_FOUND",404);
    if(document.currentRevision!==input.expectedRevision) throw new SignatureError("REVISION_CONFLICT",409);
    const [revision]=await tx.select().from(documentRevisions).where(and(eq(documentRevisions.documentId,documentId),eq(documentRevisions.revision,document.currentRevision))).limit(1);
    if(!revision) throw new SignatureError("DOCUMENT_UNAVAILABLE",503);
    const content=documentContentSchema.parse(decryptDocumentData(revision.contentCiphertext,revision.encryptionKeyVersion,ownerId,documentId,revision.revision));
    const contentHash=signatureDigest(content,revision.revision);
    await tx.insert(signatureRequests).values({id:requestId,ownerUserId:ownerId,documentId,revision:revision.revision,contentHash,expiresAt});
    for(const recipient of recipients) {
      const encrypted=encryptDossierData(recipient.email,ownerId,recipient.id);
      await assertStorageQuota(tx,ownerId,Buffer.byteLength(encrypted.ciphertext,"utf8"));
      await tx.insert(signatureParticipants).values({id:recipient.id,requestId,emailCiphertext:encrypted.ciphertext,encryptionKeyVersion:encrypted.keyVersion,inviteTokenHash:recipient.secret.hash});
      await tx.insert(signatureEvents).values({id:randomUUID(),requestId,participantId:recipient.id,eventType:"invited"});
      await enqueueSignatureMail(ownerId,{to:recipient.email,token:recipient.secret.token,locale:input.locale,verify:false,requestId,participantId:recipient.id},tx);
    }
    return contentHash;
  });
  return {id:requestId,revision:input.expectedRevision,contentHash,expiresAt,deliveryFailures:0,deliveryStatus:"queued",recipients:recipients.length};
}
export async function listSignRequests(ownerId:string,documentId:string) {
  const [document]=await db().select({id:personalDocuments.id}).from(personalDocuments).where(and(eq(personalDocuments.id,documentId),eq(personalDocuments.ownerUserId,ownerId))).limit(1);
  if(!document) throw new SignatureError("NOT_FOUND",404);
  const requests=await db().select().from(signatureRequests).where(and(eq(signatureRequests.documentId,documentId),eq(signatureRequests.ownerUserId,ownerId)));
  return Promise.all(requests.map(async request=>{
    const participants=await db().select().from(signatureParticipants).where(eq(signatureParticipants.requestId,request.id));
    return {...request,participants:participants.map(participant=>({id:participant.id,email:decryptDossierData<string>(participant.emailCiphertext,participant.encryptionKeyVersion,ownerId,participant.id),status:["signed","declined"].includes(participant.status)?participant.status:request.revokedAt?"revoked":request.expiresAt<new Date()?"expired":participant.status,signedAt:participant.signedAt}))};
  }));
}
export async function revokeSignRequest(ownerId:string,documentId:string,requestId:string) {
  await db().transaction(async tx=>{
    const [request]=await tx.select().from(signatureRequests).where(and(eq(signatureRequests.id,requestId),eq(signatureRequests.documentId,documentId),eq(signatureRequests.ownerUserId,ownerId))).for("update").limit(1);
    if(!request) throw new SignatureError("NOT_FOUND",404);
    if(request.revokedAt) return;
    await tx.update(signatureRequests).set({revokedAt:new Date()}).where(eq(signatureRequests.id,request.id));
    await tx.insert(signatureEvents).values({id:randomUUID(),requestId,eventType:"revoked"});
  });
}
export async function requestSignatureVerification(inviteToken:string,locale:"fr"|"ar") {
  ensureMailer();
  const tokenHash=hashSecretToken(inviteToken);
  if(await isRateLimited(hashSecretToken(`signature-verification:${tokenHash}`),5,60*60*1000)) throw new SignatureError("RATE_LIMITED",429);
  const [row]=await db().select({participant:signatureParticipants,request:signatureRequests}).from(signatureParticipants).innerJoin(signatureRequests,eq(signatureParticipants.requestId,signatureRequests.id)).where(and(eq(signatureParticipants.inviteTokenHash,tokenHash),isNull(signatureRequests.revokedAt),gt(signatureRequests.expiresAt,new Date()),inArray(signatureParticipants.status,["invited","viewed"]))).limit(1);
  if(!row) return;
  const verification=createSecretToken();
  const recipient=decryptDossierData<string>(row.participant.emailCiphertext,row.participant.encryptionKeyVersion,row.request.ownerUserId,row.participant.id);
  await db().transaction(async tx=>{
    await tx.update(signatureParticipants).set({verificationTokenHash:verification.hash,verificationExpiresAt:new Date(Math.min(Date.now()+30*60*1000,row.request.expiresAt.getTime())),verificationUsedAt:null}).where(eq(signatureParticipants.id,row.participant.id));
    await enqueueSignatureMail(row.request.ownerUserId,{to:recipient,token:verification.token,locale,verify:true,requestId:row.request.id,participantId:row.participant.id},tx);
  });
}
export async function verifySignatureRecipient(token:string) {
  const access=createSecretToken();
  await db().transaction(async tx=>{
    const [row]=await tx.select({participant:signatureParticipants,request:signatureRequests}).from(signatureParticipants).innerJoin(signatureRequests,eq(signatureParticipants.requestId,signatureRequests.id)).where(and(eq(signatureParticipants.verificationTokenHash,hashSecretToken(token)),isNull(signatureParticipants.verificationUsedAt),gt(signatureParticipants.verificationExpiresAt,new Date()),isNull(signatureRequests.revokedAt),gt(signatureRequests.expiresAt,new Date()),inArray(signatureParticipants.status,["invited","viewed"]))).for("update").limit(1);
    if(!row) throw new SignatureError("INVALID_OR_EXPIRED_VERIFICATION",403);
    await tx.update(signatureParticipants).set({verificationUsedAt:new Date(),verifiedAt:new Date(),accessTokenHash:access.hash,status:"viewed"}).where(eq(signatureParticipants.id,row.participant.id));
    await tx.insert(signatureEvents).values({id:randomUUID(),requestId:row.request.id,participantId:row.participant.id,eventType:"verified"});
  });
  return access.token;
}
async function sessionToken() { const token=(await cookies()).get(signatureCookieName)?.value; if(!token) throw new SignatureError("VERIFICATION_REQUIRED",401); return token; }
export async function getSignatureView() { return getSignatureViewForToken(await sessionToken()); }
export async function getSignatureViewForToken(rawToken:string) {
  const [row]=await db().select({participant:signatureParticipants,request:signatureRequests,document:personalDocuments,revision:documentRevisions}).from(signatureParticipants)
    .innerJoin(signatureRequests,eq(signatureParticipants.requestId,signatureRequests.id))
    .innerJoin(personalDocuments,eq(signatureRequests.documentId,personalDocuments.id))
    .innerJoin(documentRevisions,and(eq(documentRevisions.documentId,signatureRequests.documentId),eq(documentRevisions.revision,signatureRequests.revision)))
    .where(and(eq(signatureParticipants.accessTokenHash,hashSecretToken(rawToken)),gt(signatureParticipants.verifiedAt,new Date(Date.now()-30*60*1000)),isNull(signatureRequests.revokedAt),gt(signatureRequests.expiresAt,new Date()))).limit(1);
  if(!row || row.document.status==="trash") throw new SignatureError("INVITATION_UNAVAILABLE",404);
  const content=documentContentSchema.parse(decryptDocumentData(row.revision.contentCiphertext,row.revision.encryptionKeyVersion,row.request.ownerUserId,row.request.documentId,row.request.revision));
  if(signatureDigest(content,row.request.revision)!==row.request.contentHash) throw new SignatureError("REVISION_CHANGED",409);
  const rendered=await loadExportDocument(row.request.ownerUserId,row.request.documentId,row.request.revision);
  return {participantId:row.participant.id,requestId:row.request.id,status:row.participant.status,revision:row.request.revision,contentHash:row.request.contentHash,expiresAt:row.request.expiresAt,content:{...content,body:rendered.body,...(content.secondary?{secondary:{...content.secondary,body:renderTemplateText(content.secondary.body,rendered.answers)}}:{})},answers:rendered.answers};
}
export type SignatureDecision={decision:"signed"|"declined";contentHash:string;signaturePng?:string;consent:boolean;placement?:SignaturePlacement;kind?:"signature"|"stamp";assetId?:string;reuseConfirmed?:boolean};
export async function decideSignature(input:SignatureDecision) { return decideSignatureForToken(input,await sessionToken()); }
export async function decideSignatureForToken(input:SignatureDecision,token:string) {
  if(!input.consent) throw new SignatureError("CONSENT_REQUIRED");
  let png:string|undefined;
  let kind=input.kind??"signature";
  if(input.decision==="signed" && !signaturePlacementSchema.safeParse(input.placement).success) throw new SignatureError("INVALID_PLACEMENT");
  if(input.decision==="signed" && input.assetId) {
    if(!input.reuseConfirmed) throw new SignatureError("REUSE_CONFIRMATION_REQUIRED");
    const user=await getCurrentUser(); if(!user) throw new SignatureError("AUTHENTICATION_REQUIRED_FOR_REUSE",401);
    const asset=await getSignatureAsset(user.id,input.assetId); input.signaturePng=asset.png;kind=asset.kind;
  }
  if(input.decision==="signed") {
    if(!input.signaturePng?.startsWith("data:image/png;base64,")) throw new SignatureError("SIGNATURE_REQUIRED");
    const encoded=input.signaturePng.slice(22);
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new SignatureError("INVALID_SIGNATURE_PNG");
    const bytes=Buffer.from(encoded,"base64");
    try { validateSignaturePng(bytes); } catch { throw new SignatureError("INVALID_SIGNATURE_PNG"); }
    png=`data:image/png;base64,${bytes.toString("base64")}`;
  }
  // Resolve immutable ownership outside the write transaction. A plain SELECT before the
  // owner lock would establish a stale REPEATABLE READ snapshot for subsequent quota sums.
  const [candidate]=await db().select({requestId:signatureParticipants.requestId,ownerId:signatureRequests.ownerUserId}).from(signatureParticipants).innerJoin(signatureRequests,eq(signatureRequests.id,signatureParticipants.requestId)).where(eq(signatureParticipants.accessTokenHash,hashSecretToken(token))).limit(1);
  if(!candidate) throw new SignatureError("VERIFICATION_REQUIRED",401);
  await db().transaction(async tx=>{
    // All storage writers lock the account first, before documents/requests/participants.
    await lockStorageOwner(tx,candidate.ownerId);
    const [request]=await tx.select().from(signatureRequests).where(eq(signatureRequests.id,candidate.requestId)).for("update").limit(1);
    const [participant]=await tx.select().from(signatureParticipants).where(and(eq(signatureParticipants.accessTokenHash,hashSecretToken(token)),gt(signatureParticipants.verifiedAt,new Date(Date.now()-30*60*1000)))).for("update").limit(1);
    if(!request || !participant || request.revokedAt || request.expiresAt<=new Date()) throw new SignatureError("INVITATION_UNAVAILABLE",404);
    if(!["invited","viewed"].includes(participant.status)) throw new SignatureError("DECISION_ALREADY_RECORDED",409);
    const [document]=await tx.select().from(personalDocuments).where(eq(personalDocuments.id,request.documentId)).for("update").limit(1);
    if(!document || document.status==="trash") throw new SignatureError("INVITATION_UNAVAILABLE",404);
    const [revision]=await tx.select().from(documentRevisions).where(and(eq(documentRevisions.documentId,request.documentId),eq(documentRevisions.revision,request.revision))).limit(1);
    if(!revision) throw new SignatureError("DOCUMENT_UNAVAILABLE",503);
    const content=documentContentSchema.parse(decryptDocumentData(revision.contentCiphertext,revision.encryptionKeyVersion,request.ownerUserId,request.documentId,request.revision));
    if(request.contentHash!==input.contentHash || signatureDigest(content,request.revision)!==input.contentHash) throw new SignatureError("REVISION_CHANGED",409);
    const encrypted=png?encryptDossierData({png,kind,placement:input.placement,contentHash:request.contentHash,revision:request.revision},request.ownerUserId,participant.id):null;
    if(encrypted)await assertStorageQuota(tx,request.ownerUserId,Buffer.byteLength(encrypted.ciphertext,"utf8"),participant.signatureCiphertext?Buffer.byteLength(participant.signatureCiphertext,"utf8"):0);
    await tx.update(signatureParticipants).set({status:input.decision,signatureCiphertext:encrypted?.ciphertext ?? null,signedAt:input.decision==="signed"?new Date():null}).where(eq(signatureParticipants.id,participant.id));
    await tx.insert(signatureEvents).values({id:randomUUID(),requestId:request.id,participantId:participant.id,eventType:input.decision});
  });
}

export async function getSignatureEvidence(ownerId:string,documentId:string,requestId:string):Promise<SignedArtifactEvidence> {
  const [row]=await db().select({request:signatureRequests,document:personalDocuments,revision:documentRevisions}).from(signatureRequests)
    .innerJoin(personalDocuments,eq(signatureRequests.documentId,personalDocuments.id))
    .innerJoin(documentRevisions,and(eq(documentRevisions.documentId,signatureRequests.documentId),eq(documentRevisions.revision,signatureRequests.revision)))
    .where(and(eq(signatureRequests.id,requestId),eq(signatureRequests.documentId,documentId),eq(signatureRequests.ownerUserId,ownerId),eq(personalDocuments.ownerUserId,ownerId))).limit(1);
  if(!row || row.document.status==="trash")throw new SignatureError("NOT_FOUND",404);
  const content=documentContentSchema.parse(decryptDocumentData(row.revision.contentCiphertext,row.revision.encryptionKeyVersion,ownerId,documentId,row.request.revision));
  if(signatureDigest(content,row.request.revision)!==row.request.contentHash)throw new SignatureError("REVISION_CHANGED",409);
  const participants=await db().select().from(signatureParticipants).where(eq(signatureParticipants.requestId,requestId));
  if(participants.some(participant=>!["signed","declined"].includes(participant.status)))throw new SignatureError("SIGNATURES_STILL_PENDING",409);
  const overlays:SignatureOverlay[]=[];
  for(const participant of participants){
    if(participant.status!=="signed" || !participant.signatureCiphertext || !participant.signedAt)continue;
    const signature=decryptDossierData<{png:string;kind:"signature"|"stamp";placement:SignaturePlacement;contentHash:string;revision:number}>(participant.signatureCiphertext,participant.encryptionKeyVersion,ownerId,participant.id);
    if(signature.contentHash!==row.request.contentHash || signature.revision!==row.request.revision)throw new SignatureError("REVISION_CHANGED",409);
    overlays.push({participantId:participant.id,png:signature.png,kind:signature.kind??"signature",...signaturePlacementSchema.parse(signature.placement),signedAt:participant.signedAt,contentHash:signature.contentHash});
  }
  if(overlays.length===0)throw new SignatureError("NO_SIGNATURES",409);
  const rendered=await loadExportDocument(ownerId,documentId,row.request.revision);
  return {requestId,documentId,revision:row.request.revision,contentHash:row.request.contentHash,createdAt:row.request.createdAt,revokedAt:row.request.revokedAt,content,renderedBody:rendered.body,answers:rendered.answers,
    participants:participants.map(participant=>({id:participant.id,email:decryptDossierData<string>(participant.emailCiphertext,participant.encryptionKeyVersion,ownerId,participant.id),status:participant.status,signedAt:participant.signedAt})),overlays};
}
export async function getSignatureOverlays(documentId:string,revision:number,ownerId:string):Promise<SignatureOverlay[]> {
  const requests=await db().select({id:signatureRequests.id}).from(signatureRequests).where(and(eq(signatureRequests.documentId,documentId),eq(signatureRequests.ownerUserId,ownerId),eq(signatureRequests.revision,revision),isNull(signatureRequests.revokedAt)));
  const overlays:SignatureOverlay[]=[];
  for(const request of requests){try{overlays.push(...(await getSignatureEvidence(ownerId,documentId,request.id)).overlays);}catch(error){if(!(error instanceof SignatureError) || error.code!=="SIGNATURES_STILL_PENDING")throw error;}}
  return overlays;
}
