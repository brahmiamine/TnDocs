import assert from "node:assert/strict";
import { test, beforeEach, after, describe } from "node:test";
import { shareCreateSchema, canUseGrant, recipientEmailHash, sharedEditRevision } from "../src/modules/sharing/policy";

describe("nominative sharing policy", () => {
const previousKey = process.env.DOCUMENT_ENCRYPTION_KEY_V1;
beforeEach(() => { process.env.DOCUMENT_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 31).toString("base64"); });
after(() => { if (previousKey === undefined) delete process.env.DOCUMENT_ENCRYPTION_KEY_V1; else process.env.DOCUMENT_ENCRYPTION_KEY_V1 = previousKey; });
const grant = { recipientHash: "9c7d17cb1df764b31a6a65469880239acac53dd4a8e37ca81100018020af0156", canView: true, canCopy: false, canEdit: false, expiresAt: new Date("2027-01-01"), revokedAt: null };
const principal = { email: "recipient@example.test", verified: true };

test("only the nominated verified recipient can use a live share", () => {
  assert.equal(canUseGrant(grant, principal, "view", new Date("2026-10-29")), true);
  assert.equal(canUseGrant(grant, { email: "stranger@example.test", verified: true }, "view", new Date("2026-10-29")), false);
  assert.equal(canUseGrant(grant, { ...principal, verified: false }, "view", new Date("2026-10-29")), false);
  assert.equal(canUseGrant({ ...grant, revokedAt: new Date() }, principal, "view"), false);
  assert.equal(canUseGrant(grant, principal, "view", new Date("2027-01-01")), false);
});

test("view copy and edit are separate capabilities", () => {
  const now = new Date("2026-10-29");
  assert.equal(canUseGrant(grant, principal, "copy", now), false);
  assert.equal(canUseGrant(grant, principal, "edit", now), false);
  const edit = { ...grant, canEdit: true };
  assert.equal(canUseGrant(edit, principal, "edit", now), true);
  assert.equal(canUseGrant(edit, principal, "copy", now), false);
  const copy = { ...grant, canCopy: true, canView: false };
  assert.equal(canUseGrant(copy, principal, "copy", now), true);
  assert.equal(canUseGrant(copy, principal, "view", now), false);
  assert.equal(canUseGrant(copy, principal, "edit", now), false);
});

test("email binding is normalized and keyed, and nominative payload is required", () => {
  assert.equal(recipientEmailHash(" Recipient@Example.Test "), grant.recipientHash);
  assert.notEqual(recipientEmailHash("another@example.test"), grant.recipientHash);
  assert.equal(shareCreateSchema.safeParse({ locale: "fr", permission: "copy", expiresInDays: 7 }).success, false);
  assert.equal(shareCreateSchema.safeParse({ locale: "ar", recipientEmail: "person@example.test", expectedRevision: 4, expiresAt: "2027-01-01T00:00:00.000Z", permissions: { view: false, copy: false, edit: false } }).success, false);
  assert.equal(shareCreateSchema.safeParse({ locale: "ar", recipientEmail: "person@example.test", expectedRevision: 4, expiresAt: "2027-01-01T00:00:00.000Z", permissions: { view: false, copy: true, edit: false } }).success, true);
});

test("shared editing refuses every source drift and preserves immutable history", () => {
  assert.equal(sharedEditRevision({ expectedRevision: 4, pinnedRevision: 4, currentRevision: 4, status: "draft" }), 5);
  assert.throws(() => sharedEditRevision({ expectedRevision: 4, pinnedRevision: 4, currentRevision: 5, status: "draft" }), /REVISION_CONFLICT/);
  assert.throws(() => sharedEditRevision({ expectedRevision: 5, pinnedRevision: 4, currentRevision: 5, status: "draft" }), /REVISION_CONFLICT/);
  assert.throws(() => sharedEditRevision({ expectedRevision: 4, pinnedRevision: 4, currentRevision: 4, status: "finalized" }), /INVALID_STATE/);
});

});
