import test from "node:test";
import assert from "node:assert/strict";
import { getProcedureChecklist, snapshotItemMatches } from "../src/modules/dossiers/policy";
import { guideSchema, guideSourceIds } from "../src/modules/procedures/schema";
const source = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const label = { fr: "Pièce fictive", ar: "وثيقة افتراضية" };
const base = { title: label, summary: label, countries: ["TN"], aliases: [], start: "result", nodes: [{ id: "result", kind: "recommendation", label, sourceIds: [source], checklist: [{ id: "passport", label, required: true, sourceIds: [other] }] }] };
test("procedure checklist includes independently checked source IDs and preserves localized labels", () => {
  const guide = guideSchema.parse(base);
  assert.deepEqual(guideSourceIds(guide), [source, other]);
  assert.equal(getProcedureChecklist(guide, "result", "TN")[0].label.ar, label.ar);
  assert.throws(() => getProcedureChecklist(guide, "result", "FR"), /COUNTRY_NOT_SUPPORTED/);
  assert.throws(() => getProcedureChecklist(guide, "unknown", "TN"), /CHECKLIST_NOT_AVAILABLE/);
});
test("checklist cannot carry duplicate rules or unsourced requirements", () => {
  assert.equal(guideSchema.safeParse({ ...base, nodes: [{ ...base.nodes[0], checklist: [...base.nodes[0].checklist, ...base.nodes[0].checklist] }] }).success, false);
  assert.equal(guideSchema.safeParse({ ...base, nodes: [{ ...base.nodes[0], checklist: [{ ...base.nodes[0].checklist[0], sourceIds: [] }] }] }).success, false);
});
test("old shared membership never admits newly added, removed or replaced pieces", () => {
  const pinned = { id: "item", storedFileId: "file1", documentId: "doc1" };
  assert.equal(snapshotItemMatches(pinned, { id: "item", storedFileId: "file1", linkedDocumentId: "doc1" }), true);
  assert.equal(snapshotItemMatches(pinned, null), false);
  assert.equal(snapshotItemMatches(pinned, { id: "item", storedFileId: "file2", linkedDocumentId: "doc1" }), false);
  assert.equal(snapshotItemMatches(pinned, { id: "newitem", storedFileId: "file1", linkedDocumentId: "doc1" }), false);
  assert.equal(snapshotItemMatches(pinned, { id: "item", storedFileId: null, linkedDocumentId: "doc1" }), false);
});
