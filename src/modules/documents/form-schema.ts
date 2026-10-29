import { z } from "zod";

const keySchema = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/).refine((key) => !["constructor", "prototype", "__proto__"].includes(key), "Reserved field key");
const profileField = z.enum(["fullName", "arabicName", "latinName", "dateOfBirth", "nationality", "email", "phone", "addressTunisia", "addressAbroad", "profession", "maritalStatus", "cin", "passportNumber"]);
const localizedLabel = z.object({ fr: z.string().trim().min(1).max(180), ar: z.string().trim().min(1).max(180) }).strict();
const scalar = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);
type Scalar = z.infer<typeof scalar>;
export type FormCondition = { op: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte"; field: string; value: Scalar | Scalar[] } | { op: "all" | "any"; conditions: FormCondition[] };
function conditionSchema(depth: number): z.ZodType<FormCondition> {
  const comparison = z.object({ op: z.enum(["eq", "ne", "in", "gt", "gte", "lt", "lte"]), field: keySchema, value: z.union([scalar, z.array(scalar).max(50)]) }).strict();
  if (depth === 0) return comparison;
  return z.union([comparison, z.object({ op: z.enum(["all", "any"]), conditions: z.array(conditionSchema(depth - 1)).min(1).max(10) }).strict()]);
}
const formulaSchema = z.object({
  op: z.enum(["add", "subtract", "multiply", "divide", "concat"]),
  args: z.array(z.union([z.object({ field: keySchema }).strict(), z.object({ value: z.union([z.string().max(2000), z.number().finite()]) }).strict()])).min(1).max(20),
  separator: z.string().max(20).optional(),
}).strict();
const choices = z.array(z.object({ value: z.string().min(1).max(120), label: localizedLabel }).strict()).min(1).max(50);
const baseField = z.object({
  key: keySchema,
  kind: z.enum(["text", "textarea", "number", "currency", "email", "tel", "date", "select", "radio", "multiselect", "checkbox", "profile", "calculated"]),
  label: localizedLabel,
  required: z.boolean().default(false),
  profileField: profileField.optional(),
  options: choices.optional(),
  placeholder: localizedLabel.optional(),
  maxLength: z.number().int().min(1).max(2000).optional(),
  when: conditionSchema(3).optional(),
  formula: formulaSchema.optional(),
}).strict();
const fieldSchema = baseField.extend({
  kind: z.enum(["text", "textarea", "number", "currency", "email", "tel", "date", "select", "radio", "multiselect", "checkbox", "profile", "calculated", "repeat"]),
  itemFields: z.array(baseField).min(1).max(20).optional(),
  minItems: z.number().int().min(0).max(100).optional(),
  maxItems: z.number().int().min(1).max(100).optional(),
}).strict();
export type FormField = z.infer<typeof fieldSchema>;
export type FormSchema = { schemaVersion: 1; fields: FormField[] };
/** Kept for existing scalar callers. New list fields use Record<string, unknown>. */
export type FormAnswer = string | boolean;

function references(condition: FormCondition | undefined): string[] {
  if (!condition) return [];
  return "field" in condition ? [condition.field] : condition.conditions.flatMap(references);
}
function checkFields(fields: FormField[], context: z.RefinementCtx, path: (string | number)[]) {
  const keys = new Set<string>();
  fields.forEach((field, index) => {
    const at = [...path, index];
    const issue = (part: string, message: string) => context.addIssue({ code: "custom", path: [...at, part], message });
    if (keys.has(field.key)) issue("key", "Field keys must be unique.");
    keys.add(field.key);
    if (["select", "radio", "multiselect"].includes(field.kind)) {
      if (!field.options?.length) issue("options", "Choice fields need options.");
      if (new Set(field.options?.map((option) => option.value)).size !== field.options?.length) issue("options", "Option values must be unique.");
    } else if (field.options) issue("options", "Only choice fields can have options.");
    if (field.kind === "profile" ? !field.profileField : Boolean(field.profileField)) issue("profileField", "Profile mapping must belong to a profile field.");
    if (field.kind === "calculated" ? !field.formula : Boolean(field.formula)) issue("formula", "Only calculated fields have formulas.");
    if (field.kind === "repeat") {
      if (!field.itemFields?.length) issue("itemFields", "Repeating sections need fields.");
      if ((field.minItems ?? 0) > (field.maxItems ?? 100)) issue("minItems", "Minimum cannot exceed maximum.");
      if (field.itemFields) checkFields(field.itemFields, context, [...at, "itemFields"]);
    } else if (field.itemFields || field.minItems !== undefined || field.maxItems !== undefined) issue("itemFields", "Only repeating sections have item fields and bounds.");
  });
  const dependencies = new Map<string, string[]>();
  fields.forEach((field, index) => {
    const deps = [...references(field.when), ...(field.formula?.args.flatMap((arg) => "field" in arg ? [arg.field] : []) ?? [])];
    for (const dep of deps) if (!keys.has(dep)) context.addIssue({ code: "custom", path: [...path, index], message: `Unknown field reference: ${dep}` });
    dependencies.set(field.key, deps);
  });
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(key: string): boolean {
    if (visiting.has(key)) return false;
    if (visited.has(key)) return true;
    visiting.add(key);
    for (const dep of dependencies.get(key) ?? []) if (!visit(dep)) return false;
    visiting.delete(key); visited.add(key); return true;
  }
  for (const key of keys) if (!visit(key)) { context.addIssue({ code: "custom", path, message: "Field dependencies must not form a cycle." }); break; }
}
export const formSchema = z.object({ schemaVersion: z.literal(1), fields: z.array(fieldSchema).max(80) }).strict().superRefine((schema, context) => checkFields(schema.fields, context, ["fields"]));
export function parseFormSchema(value: unknown): FormSchema | null {
  if (value == null) return null;
  const parsed = formSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isFieldVisible(field: Pick<FormField, "when">, answers: Record<string, unknown>): boolean {
  const evaluate = (condition: FormCondition): boolean => {
    if (!("field" in condition)) return condition.op === "all" ? condition.conditions.every(evaluate) : condition.conditions.some(evaluate);
    const actual = answers[condition.field];
    if (condition.op === "eq") return actual === condition.value;
    if (condition.op === "ne") return actual !== condition.value;
    if (condition.op === "in") return Array.isArray(condition.value) && condition.value.includes(actual as Scalar);
    if (actual == null || actual === "" || Array.isArray(condition.value)) return false;
    const left = typeof actual === "number" ? actual : Number(String(actual).replace(",", "."));
    const right = typeof condition.value === "number" ? condition.value : Number(String(condition.value).replace(",", "."));
    // ISO dates compare lexicographically after their shape is checked.
    const dates = typeof actual === "string" && typeof condition.value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(actual) && /^\d{4}-\d{2}-\d{2}$/.test(condition.value);
    const a = dates ? actual as string : left; const b = dates ? condition.value as string : right;
    if (!dates && (!Number.isFinite(left) || !Number.isFinite(right))) return false;
    if (condition.op === "gt") return a > b;
    if (condition.op === "gte") return a >= b;
    if (condition.op === "lt") return a < b;
    return a <= b;
  };
  return !field.when || evaluate(field.when);
}
function computeFormula(formula: z.infer<typeof formulaSchema>, values: Record<string, unknown>): string {
  const args = formula.args.map((arg) => "field" in arg ? values[arg.field] : arg.value);
  if (formula.op === "concat") return args.map((arg) => typeof arg === "string" || typeof arg === "number" ? String(arg) : "").join(formula.separator ?? "").slice(0, 2000);
  const numbers = args.map((arg) => typeof arg === "number" ? arg : typeof arg === "string" && /^-?\d+(?:[.,]\d+)?$/.test(arg) ? Number(arg.replace(",", ".")) : NaN);
  if (numbers.some((number) => !Number.isFinite(number))) throw new Error("invalid_calculation");
  let value = numbers[0];
  if (formula.op === "add") value = numbers.reduce((sum, number) => sum + number, 0);
  if (formula.op === "multiply") value = numbers.reduce((product, number) => product * number, 1);
  if (formula.op === "subtract") value = numbers.slice(1).reduce((result, number) => result - number, numbers[0]);
  if (formula.op === "divide") value = numbers.slice(1).reduce((result, number) => { if (number === 0) throw new Error("invalid_calculation"); return result / number; }, numbers[0]);
  if (!Number.isFinite(value)) throw new Error("invalid_calculation");
  return String(Number(value.toPrecision(14)));
}
/** Recomputes declared values; never trusts submitted calculated answers. */
export function resolveFormAnswers(schema: FormSchema | null, input: Record<string, unknown>, options: {allowIncomplete?: boolean} = {}): Record<string, unknown> {
  if (!schema) return { ...input };
  const values: Record<string, unknown> = { ...input };
  const byKey = new Map(schema.fields.map((field) => [field.key, field])); const done = new Set<string>(); const pending = new Set<string>();
  function resolve(key: string) {
    if (done.has(key)) return;
    if (pending.has(key)) throw new Error("cyclic_calculation");
    const field = byKey.get(key); if (!field) return;
    pending.add(key);
    for (const dep of [...references(field.when), ...(field.formula?.args.flatMap((arg) => "field" in arg ? [arg.field] : []) ?? [])]) resolve(dep);
    if (!isFieldVisible(field,values)) { delete values[key]; pending.delete(key); done.add(key); return; }
    if (field.formula) {
      try { values[key] = isFieldVisible(field, values) ? computeFormula(field.formula, values) : ""; }
      catch (error) { if (!options.allowIncomplete) throw error; delete values[key]; }
    }
    if (field.kind === "repeat" && Array.isArray(values[key]) && field.itemFields) values[key] = (values[key] as unknown[]).map((item) => item && typeof item === "object" && !Array.isArray(item) ? resolveFormAnswers({ schemaVersion: 1, fields: field.itemFields! }, item as Record<string, unknown>, options) : item);
    pending.delete(key); done.add(key);
  }
  for (const key of byKey.keys()) resolve(key);
  return values;
}
/** Draft autosave must preserve incomplete source inputs and omit derived values that cannot yet be computed. */
export function resolveDraftFormAnswers(schema: FormSchema | null, input: Record<string, unknown>) { return resolveFormAnswers(schema, input, {allowIncomplete:true}); }
export type FormAnswerError = "unknown_field" | "required" | "invalid_type" | "invalid_value" | "too_long" | "invalid_calculation";
export function getFormAnswerErrors(schema: FormSchema | null, input: Record<string, unknown>): Record<string, FormAnswerError> {
  const errors: Record<string, FormAnswerError> = {};
  if (!schema) { for (const key of Object.keys(input)) errors[key] = "unknown_field"; return errors; }
  const keys = new Set(schema.fields.map((field) => field.key));
  for (const key of Object.keys(input)) if (!keys.has(key)) errors[key] = "unknown_field";
  let answers: Record<string, unknown>;
  try { answers = resolveFormAnswers(schema, input); } catch { errors._form = "invalid_calculation"; answers = resolveDraftFormAnswers(schema,input); }
  for (const field of schema.fields) {
    if (!isFieldVisible(field, answers)) continue;
    const answer = answers[field.key];
    if (field.kind === "calculated" && Object.hasOwn(input, field.key) && input[field.key] !== answer) { errors[field.key] = "invalid_calculation"; continue; }
    if (field.kind === "checkbox") { if (answer === undefined ? field.required : typeof answer !== "boolean" || (field.required && !answer)) errors[field.key] = field.required && !answer ? "required" : "invalid_type"; continue; }
    if (field.kind === "repeat") {
      const min = Math.max(field.required ? 1 : 0, field.minItems ?? 0);
      if (answer === undefined && min === 0) continue;
      if (!Array.isArray(answer)) { errors[field.key] = answer === undefined ? "required" : "invalid_type"; continue; }
      if (answer.length < min || answer.length > (field.maxItems ?? 100)) { errors[field.key] = "invalid_value"; continue; }
      (Array.isArray(input[field.key]) ? input[field.key] as unknown[] : answer).forEach((row, index) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) errors[`${field.key}.${index}`] = "invalid_type";
        else for (const [key, error] of Object.entries(getFormAnswerErrors({ schemaVersion: 1, fields: field.itemFields ?? [] }, row as Record<string, unknown>))) errors[`${field.key}.${index}.${key}`] = error;
      });
      continue;
    }
    if (field.kind === "multiselect") {
      if (answer === undefined && !field.required) continue;
      if (!Array.isArray(answer)) errors[field.key] = "invalid_type";
      else if ((field.required && answer.length === 0) || answer.length > (field.options?.length ?? 0) || new Set(answer).size !== answer.length || answer.some((value) => typeof value !== "string" || !field.options?.some((option) => option.value === value))) errors[field.key] = "invalid_value";
      continue;
    }
    if (answer === undefined || answer === "" || (typeof answer === "string" && !answer.trim())) { if (field.required) errors[field.key] = "required"; continue; }
    if (typeof answer !== "string") { errors[field.key] = "invalid_type"; continue; }
    if (answer.length > (field.maxLength ?? 2000)) { errors[field.key] = "too_long"; continue; }
    if (["select", "radio"].includes(field.kind) && !field.options?.some((option) => option.value === answer)) errors[field.key] = "invalid_value";
    if (["number", "currency"].includes(field.kind) && (!/^-?\d+(?:[.,]\d+)?$/.test(answer) || !Number.isFinite(Number(answer.replace(",", "."))))) errors[field.key] = "invalid_value";
    if (field.kind === "email" && !z.string().email().safeParse(answer).success) errors[field.key] = "invalid_value";
    if (field.kind === "tel" && !/^[+\d][\d\s().-]{2,39}$/.test(answer)) errors[field.key] = "invalid_value";
    if (field.kind === "date") {
      const date = new Date(`${answer}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(answer) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== answer) errors[field.key] = "invalid_value";
    }
  }
  return errors;
}
export function validateFormAnswers(schema: FormSchema | null, answers: Record<string, unknown>) { return Object.keys(getFormAnswerErrors(schema, answers)).length === 0; }
function renderValue(value: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "✓" : "";
  if (Array.isArray(value)) return value.map((item) => renderValue(item, depth + 1)).join("\n");
  if (value && typeof value === "object") return Object.values(value).map((item) => renderValue(item, depth + 1)).filter(Boolean).join(" · ");
  return "";
}
export function renderTemplateText(source: string, answers: Record<string, unknown>) {
  return source.replace(/\{\{\s*([a-z][a-z0-9_]{0,59})\s*\}\}/g, (_match, key: string) => renderValue(answers[key]));
}
