import { z } from "zod";

export const createDossierSchema = z.object({ title: z.string().trim().min(2).max(180) });
export const createDossierItemSchema = z.object({
  label: z.string().trim().min(2).max(240),
  required: z.boolean().default(true),
  documentId: z.string().uuid().optional(),
});
export const updateDossierItemSchema = z.object({ status: z.enum(["missing", "added", "reviewed", "expired"]) });
