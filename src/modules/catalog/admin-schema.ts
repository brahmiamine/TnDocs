import { z } from "zod";

const translationSchema = z.object({
  title: z.string().trim().min(3).max(240),
  summary: z.string().trim().min(3).max(1000),
  instructions: z.string().max(20_000).default(""),
  body: z.string().max(30_000).default(""),
});

export const catalogDraftSchema = z.object({
  documentType: z.enum(["editable", "official", "informational"]),
  organizationId: z.string().uuid().optional(),
  categorySlugs: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120)).min(1).max(20),
  translations: z.object({ fr: translationSchema.optional(), ar: translationSchema.optional() })
    .refine((value) => Boolean(value.fr || value.ar), "At least one reviewed translation is required."),
  formSchema: z.record(z.string(), z.unknown()).optional(),
  documentContent: z.record(z.string(), z.unknown()).optional(),
  sources: z.array(z.object({
    sourceName: z.string().trim().min(2).max(180),
    sourceUrl: z.string().url().max(2048).refine((value) => new URL(value).protocol === "https:"),
    official: z.boolean().default(false),
    reusePermission: z.enum(["pending", "allowed", "no_reproduction", "forbidden"]).default("pending"),
    reviewed: z.boolean().default(false),
  })).max(30).default([]),
});

export type CatalogDraftInput = z.infer<typeof catalogDraftSchema>;
