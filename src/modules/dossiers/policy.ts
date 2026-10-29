import { z } from "zod";
import type { Guide } from "@/modules/procedures/schema";

export const procedureDossierSchema = z.object({ guideId: z.string().uuid(), expectedVersion: z.number().int().positive(), nodeId: z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/), country: z.string().regex(/^[A-Z]{2}$/), locale: z.enum(["fr", "ar"]), confirmation: z.literal(true) }).strict();
export const createDossierShareSchema = z.object({ recipientEmail: z.string().trim().email().max(320), expiresAt: z.string().datetime(), allowDownload: z.boolean(), locale: z.enum(["fr", "ar"]) }).strict();
export const dossierShareAccessSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
export const snapshotSchema = z.object({ version: z.literal(1), title: z.string().max(180), items: z.array(z.object({ id: z.string().uuid(), label: z.string().max(240), required: z.boolean(), storedFileId: z.string().uuid().nullable(), documentId: z.string().uuid().nullable(), revision: z.number().int().positive().nullable() }).strict()) }).strict();
export type DossierShareSnapshot = z.infer<typeof snapshotSchema>;
export function getProcedureChecklist(guide: Guide, nodeId: string, country: string) {
  if (!/^[A-Z]{2}$/.test(country) || (!guide.countries.includes("*") && !guide.countries.includes(country))) throw new Error("COUNTRY_NOT_SUPPORTED");
  const node = guide.nodes.find(node => node.id === nodeId);
  if (node?.kind !== "recommendation" || !node.checklist.length) throw new Error("CHECKLIST_NOT_AVAILABLE");
  return node.checklist;
}
export function snapshotItemMatches(pinned: { id: string; storedFileId: string | null; documentId: string | null }, current: { id: string; storedFileId: string | null; linkedDocumentId: string | null } | null | undefined) {
  return Boolean(current && current.id === pinned.id && current.storedFileId === pinned.storedFileId && current.linkedDocumentId === pinned.documentId);
}
