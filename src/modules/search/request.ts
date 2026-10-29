import { z } from "zod";
export const publicSearchRequestSchema = z.object({
  locale: z.enum(["fr", "ar"]).default("fr"), q: z.string().trim().max(120).optional(),
  category: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  documentType: z.enum(["editable", "official", "informational"]).optional(), organizationId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24), offset: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  mode: z.enum(["auto", "simple"]).default("auto"),
});
export function publicSearchRequest(url: URL) {
  const values: Record<string, string> = {};
  for (const key of ["locale", "q", "category", "documentType", "organizationId", "limit", "offset", "mode"]) { const value = url.searchParams.get(key); if (value !== null && value !== "") values[key] = value; }
  return publicSearchRequestSchema.safeParse(values);
}
