import { z } from "zod";
const localized = z.object({ fr: z.string().trim().min(1).max(3000), ar: z.string().trim().min(1).max(3000) }).strict();
const checklistLabel = z.object({ fr: z.string().trim().min(1).max(240), ar: z.string().trim().min(1).max(240) }).strict();
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/);
const sourceIds = z.array(z.string().uuid()).min(1).max(30);
const nodeSchema = z.discriminatedUnion("kind", [
  z.object({ id: key, kind: z.literal("question"), label: localized, choices: z.array(z.object({ id: key, label: localized, next: key }).strict()).min(2).max(20) }).strict(),
  z.object({ id: key, kind: z.literal("recommendation"), label: localized, sourceIds, templateIds: z.array(z.string().uuid()).max(20).default([]), checklist: z.array(z.object({ id: key, label: checklistLabel, required: z.boolean().default(true), sourceIds }).strict()).max(100).default([]), facts: z.array(z.object({ label: localized, value: localized.nullable(), sourceIds: z.array(z.string().uuid()).max(30).default([]) }).strict().refine(fact => fact.value === null || fact.sourceIds.length > 0, "Known facts require sources")).max(30).default([]) }).strict(),
  z.object({ id: key, kind: z.literal("unknown"), label: localized }).strict(),
]);
export const guideSchema = z.object({ title: localized, summary: localized, countries: z.array(z.string().regex(/^(?:[A-Z]{2}|\*)$/)).min(1).max(250), aliases: z.array(z.string().trim().min(2).max(200)).max(100), start: key, nodes: z.array(nodeSchema).min(1).max(100) }).strict().superRefine((guide, ctx) => {
  const nodes = new Map(guide.nodes.map(node => [node.id, node]));
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (nodes.size !== guide.nodes.length) fail("Node identifiers must be unique");
  if (!nodes.has(guide.start)) fail("Start node must exist");
  for (const node of guide.nodes) if (node.kind === "question") {
    if (!node.choices.some(choice => choice.id === "unknown")) fail("Each question needs an unknown choice");
    if (new Set(node.choices.map(choice => choice.id)).size !== node.choices.length) fail("Choice identifiers must be unique");
    if (node.choices.some(choice => !nodes.has(choice.next))) fail("Every choice must point to an existing node");
  }
  for (const node of guide.nodes) if (node.kind === "recommendation" && new Set(node.checklist.map(item => item.id)).size !== node.checklist.length) fail("Checklist identifiers must be unique within a recommendation");
  const done = new Set<string>(), active = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return false;
    if (done.has(id)) return true;
    active.add(id); const node = nodes.get(id);
    if (node?.kind === "question" && node.choices.some(choice => !visit(choice.next))) return false;
    active.delete(id); done.add(id); return true;
  }
  if (guide.nodes.some(node => !visit(node.id))) fail("Decision graphs must be acyclic");
});
export type Guide = z.infer<typeof guideSchema>;
export function nextGuideNode(guide: Guide, current: string, choiceId: string) {
  const node = guide.nodes.find(node => node.id === current);
  if (node?.kind !== "question") return null;
  const choice = node.choices.find(choice => choice.id === choiceId);
  return guide.nodes.find(node => node.id === choice?.next) ?? null;
}
export function normalizeIntent(query: string) {
  return query.normalize("NFKD").replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/gu, "").replace(/[أإآٱ]/gu, "ا").replace(/ى/gu, "ي").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
export function matchGuideIntent<T extends { id: string; content: Guide }>(query: string, guides: T[]): T | null {
  if (query.length > 500) return null;
  const normalized = ` ${normalizeIntent(query)} `;
  const matches = guides.map(guide => ({ guide, score: Math.max(0, ...guide.content.aliases.map(alias => { const a = normalizeIntent(alias); return a && normalized.includes(` ${a} `) ? a.length : 0; })) })).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.guide.id.localeCompare(b.guide.id));
  if (matches.length > 1 && matches[0].score === matches[1].score) return null;
  return matches[0]?.guide ?? null;
}

export function guideSourceIds(guide: Guide) {
  return [...new Set(guide.nodes.flatMap(node => node.kind === "recommendation" ? [...node.sourceIds, ...node.facts.flatMap(fact => fact.sourceIds), ...node.checklist.flatMap(item => item.sourceIds)] : []))];
}
