import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchText, expandSearchQuery, searchDictionarySchema, escapeSearchLike, meiliFilters } from "../src/modules/search/policy";
test("Search normalizes French accents and Arabic forms without evaluating user text", () => {
  assert.equal(normalizeSearchText("  RÉSILIATION  "), "resiliation");
  assert.equal(normalizeSearchText("إِشْتِرَاك ـ آجل"), "اشتراك اجل");
  const dictionary = searchDictionarySchema.parse({ synonyms: { resiliation: ["فسخ", "annulation"] }, intents: [{ phrases: ["نحب نفسخ اشتراك", "arrêter abonnement"], query: "resiliation" }] });
  assert.equal(expandSearchQuery("Je veux arrêter abonnement", dictionary).query, "resiliation");
  assert.equal(expandSearchQuery("نحب نفسخ اشتراك", dictionary).query, "resiliation");
  assert.equal(expandSearchQuery("process.exit(1)", dictionary).query, "process exit 1");
  assert.ok(expandSearchQuery("Résiliation", dictionary).terms.includes("فسخ"));
  assert.equal(searchDictionarySchema.safeParse({ synonyms: {}, intents: [{ phrases: ["x"], query: "x", code: "eval()" }] }).success, false);
});
test("Meili filters quote literal values and DB wildcards are escaped", () => {
  assert.deepEqual(meiliFilters({ category: 'x" OR locale = ar', documentType: "official", organizationId: "org" }), ['categorySlugs = "x\\\" OR locale = ar"', 'documentType = "official"', 'organizationId = "org"']);
  assert.equal(escapeSearchLike("100%_\\"), "100\\%\\_\\\\");
});
