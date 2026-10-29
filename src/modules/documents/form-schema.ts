import { z } from "zod";

const localizedLabel = z.object({ fr: z.string().trim().min(1).max(180), ar: z.string().trim().min(1).max(180) });
const fieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
  kind: z.enum(["text", "textarea", "number", "date", "select", "checkbox"]),
  label: localizedLabel,
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string().min(1).max(120), label: localizedLabel })).max(50).optional(),
  placeholder: localizedLabel.optional(),
  maxLength: z.number().int().min(1).max(2000).optional(),
}).superRefine((field, context) => {
  if (field.kind === "select" && (!field.options || field.options.length === 0)) context.addIssue({ code: "custom", path: ["options"], message: "Select fields need options." });
  if (field.kind !== "select" && field.options?.length) context.addIssue({ code: "custom", path: ["options"], message: "Only select fields can have options." });
});

export const formSchema = z.object({ schemaVersion: z.literal(1), fields: z.array(fieldSchema).max(80) })
  .superRefine((schema, context) => {
    const keys = new Set<string>();
    for (const [index, field] of schema.fields.entries()) {
      if (keys.has(field.key)) context.addIssue({ code: "custom", path: ["fields", index, "key"], message: "Field keys must be unique." });
      keys.add(field.key);
    }
  });

export type FormSchema = z.infer<typeof formSchema>;
export type FormAnswer = string | boolean;

export function parseFormSchema(value: unknown): FormSchema | null {
  if (value == null) return null;
  const parsed = formSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function validateFormAnswers(schema: FormSchema | null, answers: Record<string, unknown>) {
  if (!schema) return Object.keys(answers).length === 0;
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  if (Object.keys(answers).some((key) => !fields.has(key))) return false;
  return schema.fields.every((field) => {
    const answer = answers[field.key];
    if (field.kind === "checkbox") return answer === undefined || typeof answer === "boolean";
    if (answer === undefined || answer === "") return !field.required;
    if (typeof answer !== "string") return false;
    if (field.kind === "select") return field.options?.some((option) => option.value === answer) ?? false;
    if (field.kind === "number") return /^-?\d+(?:[.,]\d+)?$/.test(answer);
    if (field.kind === "date") return /^\d{4}-\d{2}-\d{2}$/.test(answer) && !Number.isNaN(Date.parse(`${answer}T00:00:00Z`));
    return answer.length <= (field.maxLength ?? 2000);
  });
}

export function renderTemplateText(source: string, answers: Record<string, unknown>) {
  return source.replace(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/g, (_match, key: string) => {
    const value = answers[key];
    return typeof value === "string" || typeof value === "number" ? value.toString() : typeof value === "boolean" && value ? "✓" : "";
  });
}
