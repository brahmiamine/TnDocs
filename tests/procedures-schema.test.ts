import test from "node:test";
import assert from "node:assert/strict";
import { guideSchema, nextGuideNode, normalizeIntent, matchGuideIntent } from "../src/modules/procedures/schema";
const source = "00000000-0000-4000-8000-000000000001";
const label = { fr: "Question", ar: "سؤال" };
const guide = { title: label, summary: label, countries: ["TN"], aliases: ["résilier abonnement", "نحب نفسخ اشتراك"], start: "question", nodes: [ { id: "question", kind: "question", label, choices: [{ id: "yes", label, next: "result" }, { id: "unknown", label, next: "unknown" }] }, { id: "result", kind: "recommendation", label, sourceIds: [source], templateIds: [], facts: [{ label, value: label, sourceIds: [source] }] }, { id: "unknown", kind: "unknown", label } ] };
test("Guides require valid references, unknown choice and acyclic decisions", () => {
  assert.equal(guideSchema.safeParse(guide).success, true);
  assert.equal(guideSchema.safeParse({ ...guide, start: "missing" }).success, false);
  assert.equal(guideSchema.safeParse({ ...guide, nodes: [{ ...guide.nodes[0], choices: [{ id: "yes", label, next: "question" }, { id: "unknown", label, next: "unknown" }] }, ...guide.nodes.slice(1)] }).success, false);
  assert.equal(guideSchema.safeParse({ ...guide, nodes: [{ ...guide.nodes[0], choices: [{ id: "yes", label, next: "result" }] }, ...guide.nodes.slice(1)] }).success, false);
});
test("Recommendations must cite sources and unknown facts are not invented", () => {
  assert.equal(guideSchema.safeParse({ ...guide, nodes: [guide.nodes[0], { ...guide.nodes[1], sourceIds: [] }, guide.nodes[2]] }).success, false);
  const parsed = guideSchema.parse(guide);
  assert.equal(nextGuideNode(parsed, "question", "yes")?.id, "result");
  assert.equal(nextGuideNode(parsed, "question", "invalid"), null);
  assert.equal(nextGuideNode(parsed, "result", "yes"), null);
});
test("French and Arabic intent matching is deterministic, normalized and bounded", () => {
  const parsed = guideSchema.parse(guide);
  assert.equal(normalizeIntent("  RÉSILIER  abonnement! "), "resilier abonnement");
  assert.equal(matchGuideIntent("Je veux résilier abonnement", [{ id: "one", content: parsed }])?.id, "one");
  assert.equal(matchGuideIntent("نحب نفسخ اشتراك", [{ id: "one", content: parsed }])?.id, "one");
  assert.equal(matchGuideIntent("unmatched", [{ id: "one", content: parsed }]), null);
  assert.equal(matchGuideIntent("x".repeat(501), [{ id: "one", content: parsed }]), null);
});
