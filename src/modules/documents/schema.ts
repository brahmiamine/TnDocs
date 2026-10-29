import { z } from "zod";
import { richDocumentSchema } from "./rich-document";

export const secondaryDocumentSectionSchema = z.object({
  title: z.string().max(240).optional(),
  locale: z.enum(["fr", "ar"]),
  body: z.string().max(50_000),
  richDocument: richDocumentSchema.optional(),
}).strict();
export type SecondaryDocumentSection = z.infer<typeof secondaryDocumentSectionSchema>;

export const documentContentSchema = z.object({
  title: z.string().max(240).optional(),
  locale: z.enum(["fr", "ar"]),
  body: z.string().max(50_000),
  richDocument: richDocumentSchema.optional(),
  answers: z.record(z.string().max(120), z.unknown()).default({}),
  secondary: secondaryDocumentSectionSchema.optional(),
}).superRefine((content, context) => {
  if (content.secondary?.locale === content.locale) context.addIssue({code:"custom",path:["secondary","locale"],message:"Bilingual sections must have different languages."});
});

export const createDocumentSchema = z.object({
  templateId: z.string().uuid(),
  locale: z.enum(["fr", "ar"]),
  bilingual: z.boolean().optional(),
});

export const saveRevisionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  title: z.string().trim().min(1).max(240),
  content: documentContentSchema,
});

export const restoreRevisionSchema = z.object({
  sourceRevision: z.number().int().positive(),
  expectedRevision: z.number().int().positive(),
});

export const restoreDocumentSchema = z.object({ action: z.literal("restore") });

export type DocumentContent = z.infer<typeof documentContentSchema>;
