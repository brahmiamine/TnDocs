import { z } from "zod";

export const documentContentSchema = z.object({
  locale: z.enum(["fr", "ar"]),
  body: z.string().max(50_000),
  answers: z.record(z.string().max(120), z.unknown()).default({}),
});

export const createDocumentSchema = z.object({
  templateId: z.string().uuid(),
  locale: z.enum(["fr", "ar"]),
});

export const saveRevisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  content: documentContentSchema,
});

export type DocumentContent = z.infer<typeof documentContentSchema>;
