import { index, int, mysqlEnum, mysqlTable, mediumtext, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";
import { personalDocuments, users } from "@/platform/database/schema";
const id = (name:string) => varchar(name,{length:36});
export const signatureRequests = mysqlTable("signature_requests", {
  id:id("id").primaryKey(),
  ownerUserId:id("owner_user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  documentId:id("document_id").notNull().references(()=>personalDocuments.id,{onDelete:"cascade"}),
  revision:int("revision").notNull(),
  contentHash:varchar("content_hash",{length:64}).notNull(),
  expiresAt:timestamp("expires_at").notNull(), revokedAt:timestamp("revoked_at"),
  createdAt:timestamp("created_at").defaultNow().notNull(),
},table=>[index("signature_requests_document_idx").on(table.documentId)]);
export const signatureParticipants = mysqlTable("signature_participants", {
  id:id("id").primaryKey(), requestId:id("request_id").notNull().references(()=>signatureRequests.id,{onDelete:"cascade"}),
  emailCiphertext:text("email_ciphertext").notNull(), encryptionKeyVersion:varchar("encryption_key_version",{length:8}).notNull(),
  inviteTokenHash:varchar("invite_token_hash",{length:64}).notNull(),
  verificationTokenHash:varchar("verification_token_hash",{length:64}), verificationExpiresAt:timestamp("verification_expires_at"), verificationUsedAt:timestamp("verification_used_at"),
  accessTokenHash:varchar("access_token_hash",{length:64}), verifiedAt:timestamp("verified_at"),
  status:mysqlEnum("status",["invited","viewed","signed","declined"]).notNull().default("invited"),
  signatureCiphertext:mediumtext("signature_ciphertext"), signedAt:timestamp("signed_at"),
  createdAt:timestamp("created_at").defaultNow().notNull(),
},table=>[uniqueIndex("signature_participants_invite_unique").on(table.inviteTokenHash),uniqueIndex("signature_participants_verification_unique").on(table.verificationTokenHash),uniqueIndex("signature_participants_access_unique").on(table.accessTokenHash),index("signature_participants_request_idx").on(table.requestId)]);
export const signatureEvents = mysqlTable("signature_events", {
  id:id("id").primaryKey(), requestId:id("request_id").notNull().references(()=>signatureRequests.id,{onDelete:"cascade"}),
  participantId:id("participant_id").references(()=>signatureParticipants.id,{onDelete:"cascade"}),
  eventType:mysqlEnum("event_type",["invited","verified","viewed","signed","declined","revoked"]).notNull(),
  createdAt:timestamp("created_at").defaultNow().notNull(),
},table=>[index("signature_events_request_idx").on(table.requestId)]);
export const signatureAssets = mysqlTable("signature_assets", {
  id:id("id").primaryKey(), ownerUserId:id("owner_user_id").notNull().references(()=>users.id,{onDelete:"cascade"}),
  kind:mysqlEnum("kind",["signature","stamp"]).notNull(), dataCiphertext:mediumtext("data_ciphertext").notNull(),
  encryptionKeyVersion:varchar("encryption_key_version",{length:8}).notNull(),
  createdAt:timestamp("created_at").defaultNow().notNull(),
},table=>[index("signature_assets_owner_idx").on(table.ownerUserId)]);
