import { z } from "zod";
const term = z.string().trim().min(1).max(120);
export const searchDictionarySchema = z.object({ synonyms: z.record(term, z.array(term).min(1).max(20)).refine(value => Object.keys(value).length <= 200, "Too many synonym groups"), intents: z.array(z.object({ phrases: z.array(term).min(1).max(20), query: term }).strict()).max(100) }).strict();
export type SearchDictionary = z.infer<typeof searchDictionarySchema>;
export function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/gu, "").replace(/[أإآٱ]/gu, "ا").replace(/ى/gu, "ي").replace(/œ/gi, "oe").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
export const defaultSearchDictionary: SearchDictionary = { synonyms: { procuration: ["توكيل", "وكالة"], resiliation: ["فسخ", "annulation", "إلغاء"], declaration: ["تصريح"], attestation: ["شهادة"], passeport: ["جواز سفر"] }, intents: [{ phrases: ["نحب نفسخ اشتراك", "arrêter abonnement", "arreter mon abonnement"], query: "resiliation" }] };
export function expandSearchQuery(input: string, dictionary: SearchDictionary) {
  const normalized = normalizeSearchText(input.slice(0, 120)), padded = ` ${normalized} `;
  const rules = dictionary.intents.flatMap(rule => rule.phrases.map(phrase => ({ phrase: normalizeSearchText(phrase), query: normalizeSearchText(rule.query) }))).filter(rule => rule.phrase && padded.includes(` ${rule.phrase} `)).sort((a, b) => b.phrase.length - a.phrase.length);
  const query = rules[0]?.query ?? normalized;
  const terms = new Set([query]);
  for (const [key, values] of Object.entries(dictionary.synonyms)) {
    const group = [key, ...values].map(normalizeSearchText);
    if (group.some(value => value === query)) group.forEach(value => terms.add(value));
  }
  return { query, terms: [...terms].filter(Boolean) };
}
export function escapeSearchLike(value: string) { return value.replace(/[\\%_]/g, char => `\\${char}`); }
export type SearchFilters = { category?: string; documentType?: "editable" | "official" | "informational"; organizationId?: string };
export function meiliFilters(options: SearchFilters) {
  const filters: string[] = [];
  if (options.category) filters.push(`categorySlugs = ${JSON.stringify(options.category)}`);
  if (options.documentType) filters.push(`documentType = ${JSON.stringify(options.documentType)}`);
  if (options.organizationId) filters.push(`organizationId = ${JSON.stringify(options.organizationId)}`);
  return filters;
}
export function normalizedSynonyms(dictionary: SearchDictionary) {
  const result: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(dictionary.synonyms)) {
    const group = [...new Set([key, ...values].map(normalizeSearchText))].filter(Boolean);
    for (const value of group) result[value] = group.filter(other => other !== value);
  }
  return result;
}
