import { z } from "zod";
import { formSchema } from "@/modules/documents/form-schema";
import { encryptDocumentData, decryptDocumentData } from "@/modules/documents/crypto";

const blueprintSchema = z.object({
  title: z.string().trim().min(1).max(240),
  body: z.string().max(50_000),
  locale: z.enum(["fr", "ar"]),
  formSchema: formSchema.nullable().default(null),
}).strict();
export const privateTemplateInputSchema = blueprintSchema.extend({ confirmSanitized: z.literal(true) }).strict();
export const updatePrivateTemplateSchema = blueprintSchema.partial().extend({ expectedVersion: z.number().int().positive(), confirmSanitized: z.literal(true) }).strict();
export type PrivateTemplateBlueprint = z.infer<typeof blueprintSchema>;
/** Accept only the original model, never a rendered/prefilled revision. Extra properties are deliberately discarded. */
export function sanitizeReusableTemplate(source: {title: unknown; body: unknown; locale: unknown; formSchema?: unknown; [key:string]:unknown}): PrivateTemplateBlueprint {
  return blueprintSchema.parse({ title: source.title, body: source.body, locale: source.locale, formSchema: source.formSchema ?? null });
}
export function encryptPrivateTemplate(value: PrivateTemplateBlueprint, ownerId: string, templateId: string, version: number) {
  return encryptDocumentData(blueprintSchema.parse(value), ownerId, `${templateId}:private-template`, version);
}
export function decryptPrivateTemplate(encoded: string, keyVersion: string, ownerId: string, templateId: string, version: number): PrivateTemplateBlueprint {
  return blueprintSchema.parse(decryptDocumentData(encoded, keyVersion, ownerId, `${templateId}:private-template`, version));
}
export function encryptPrivateDocumentModel(value: PrivateTemplateBlueprint, ownerId: string, documentId: string) {
  return encryptDocumentData(blueprintSchema.parse(value), ownerId, `${documentId}:private-model`, 0);
}
export function decryptPrivateDocumentModel(encoded: string, keyVersion: string, ownerId: string, documentId: string): PrivateTemplateBlueprint {
  return blueprintSchema.parse(decryptDocumentData(encoded, keyVersion, ownerId, `${documentId}:private-model`, 0));
}
