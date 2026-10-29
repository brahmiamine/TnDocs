import { asc,eq,inArray } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { decryptDossierData } from "@/modules/documents/crypto";
import { signatureEvents,signatureParticipants,signatureRequests } from "./db-schema";
import { listSignatureAssets } from "./assets";
/** Account export intentionally enumerates fields; never serialize challenge/session rows wholesale. */
export async function exportOwnSignatureData(ownerId:string){
 if(!database)throw new Error("SERVICE_UNAVAILABLE");
 const requests=await database.select().from(signatureRequests).where(eq(signatureRequests.ownerUserId,ownerId)).orderBy(asc(signatureRequests.createdAt));
 const ids=requests.map(request=>request.id);
 const [participants,events,assets]=await Promise.all([
  ids.length?database.select().from(signatureParticipants).where(inArray(signatureParticipants.requestId,ids)):[],
  ids.length?database.select().from(signatureEvents).where(inArray(signatureEvents.requestId,ids)).orderBy(asc(signatureEvents.createdAt)):[],
  listSignatureAssets(ownerId),
 ]);
 return {assets,requests:requests.map(request=>({id:request.id,documentId:request.documentId,revision:request.revision,contentHash:request.contentHash,createdAt:request.createdAt,expiresAt:request.expiresAt,revokedAt:request.revokedAt,
   participants:participants.filter(participant=>participant.requestId===request.id).map(participant=>({id:participant.id,email:decryptDossierData<string>(participant.emailCiphertext,participant.encryptionKeyVersion,ownerId,participant.id),status:participant.status,verifiedAt:participant.verifiedAt,signedAt:participant.signedAt,signature:participant.signatureCiphertext?decryptDossierData<unknown>(participant.signatureCiphertext,participant.encryptionKeyVersion,ownerId,participant.id):null})),
   audit:events.filter(event=>event.requestId===request.id).map(event=>({id:event.id,participantId:event.participantId,type:event.eventType,createdAt:event.createdAt})),
 }))};
}
