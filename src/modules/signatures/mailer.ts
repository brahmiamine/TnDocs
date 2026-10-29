import { randomUUID } from "node:crypto";
import { and,eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import { database } from "@/platform/database/client";
import { enqueueJob,type JobTransaction } from "@/platform/jobs/queue";
import { encryptDossierData,decryptDossierData } from "@/modules/documents/crypto";
import { hashSecretToken } from "@/modules/identity/tokens";
import { env } from "@/platform/config/env";
import { signatureParticipants,signatureRequests } from "./db-schema";
type Mail={to:string;token:string;locale:"fr"|"ar";verify:boolean;requestId:string;participantId:string};
export async function enqueueSignatureMail(ownerId:string,input:Mail,tx:JobTransaction){
 const scopeId=randomUUID(),encrypted=encryptDossierData(input,ownerId,scopeId);
 return enqueueJob({kind:"signature.mail",ownerUserId:ownerId,key:`signature-mail:${input.participantId}:${input.verify?hashSecretToken(input.token):"invite"}`,payload:{scopeId,messageCiphertext:encrypted.ciphertext,keyVersion:encrypted.keyVersion}},tx);
}
/** SMTP is at-least-once after crashes. A stable Message-ID permits provider-side deduplication. */
export async function performSignatureMail(job:{id:string;ownerUserId:string|null;payload:Record<string,unknown>},sender?:(mail:SendMailOptions)=>Promise<unknown>){
 if(!database||!job.ownerUserId)throw new Error("INVALID_JOB");
 const {scopeId,messageCiphertext,keyVersion}=job.payload;
 if(typeof scopeId!=="string"||typeof messageCiphertext!=="string"||typeof keyVersion!=="string")throw new Error("INVALID_JOB");
 const mail=decryptDossierData<Mail>(messageCiphertext,keyVersion,job.ownerUserId,scopeId);
 const [row]=await database.select({participant:signatureParticipants,request:signatureRequests}).from(signatureParticipants).innerJoin(signatureRequests,eq(signatureParticipants.requestId,signatureRequests.id)).where(and(eq(signatureParticipants.id,mail.participantId),eq(signatureRequests.id,mail.requestId),eq(signatureRequests.ownerUserId,job.ownerUserId))).limit(1);
 if(!row||row.request.revokedAt||row.request.expiresAt<=new Date()||!["invited","viewed"].includes(row.participant.status))return {skipped:true};
 if(mail.verify && (row.participant.verificationTokenHash!==hashSecretToken(mail.token)||!row.participant.verificationExpiresAt||row.participant.verificationExpiresAt<=new Date()||row.participant.verificationUsedAt))return {skipped:true};
 if(!env.SMTP_HOST)throw new Error("SMTP_NOT_CONFIGURED");
 const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:env.SMTP_PORT,secure:env.SMTP_SECURE,connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}:undefined});
 const url=new URL(`/${mail.locale}/signer`,env.APP_URL);url.hash=`${mail.verify?"verify":"invite"}=${mail.token}`;
 await (sender??((message:SendMailOptions)=>transport.sendMail(message)))({from:env.SMTP_FROM,to:mail.to,messageId:`<signature-${job.id}@${new URL(env.APP_URL).hostname}>`,subject:mail.locale==="ar"?"دعوة توقيع TnDocs":"Invitation de signature TnDocs",text:mail.locale==="ar"?`دعوة خاصة. افتح الرابط: ${url.toString()}\nلا تمنح الصورة توقيعاً إلكترونياً مؤهلاً.`:`Invitation privée. Ouvrez ce lien : ${url.toString()}\nUne image de signature ne constitue pas une signature électronique qualifiée.`});
 return {delivered:true};
}
