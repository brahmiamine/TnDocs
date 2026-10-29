import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const sharePermissionsSchema = z.object({ view: z.boolean(), copy: z.boolean(), edit: z.boolean() }).strict().refine((value) => value.view || value.copy || value.edit, "Select at least one capability.");
export const shareCreateSchema = z.object({ recipientEmail: z.string().trim().email().max(320), expectedRevision: z.number().int().positive(), locale: z.enum(["fr", "ar"]), expiresAt: z.string().datetime(), permissions: sharePermissionsSchema }).strict();
export const shareAccessSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export type ShareAction = "view" | "copy" | "edit";
export type SharePermissions = { view: boolean; copy: boolean; edit: boolean };
export function normalizeRecipientEmail(email: string) { return email.trim().toLowerCase(); }
/** Keyed lookup avoids an offline dictionary of recipient email addresses. */
export function recipientEmailHash(email: string) {
  const key = Buffer.from(process.env.DOCUMENT_ENCRYPTION_KEY_V1 ?? "", "base64");
  if (key.length !== 32) throw new Error("SHARING_NOT_CONFIGURED");
  return createHmac("sha256", key).update(`tndocs-share-recipient-v1:${normalizeRecipientEmail(email)}`).digest("hex");
}
export function canUseGrant(grant: { recipientHash: string; canView: boolean | number; canCopy: boolean | number; canEdit: boolean | number; expiresAt: Date; revokedAt: Date | null }, principal: { email: string; verified: boolean }, action: ShareAction, now = new Date()): boolean {
  if (!principal.verified || grant.revokedAt || !Number.isFinite(grant.expiresAt.getTime()) || grant.expiresAt <= now) return false;
  const expected = Buffer.from(recipientEmailHash(principal.email));
  const actual = Buffer.from(grant.recipientHash);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return false;
  return Boolean(action === "view" ? grant.canView : action === "copy" ? grant.canCopy : grant.canEdit);
}
export function sharedEditRevision(value: { expectedRevision: number; pinnedRevision: number; currentRevision: number; status: string }) {
  if (value.status !== "draft") throw new Error("INVALID_STATE");
  if (value.expectedRevision !== value.pinnedRevision || value.expectedRevision !== value.currentRevision) throw new Error("REVISION_CONFLICT");
  return value.expectedRevision + 1;
}
