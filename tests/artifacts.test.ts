import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactCleanupEligible, validateArtifactOwnerKey } from '../src/platform/jobs/artifacts-policy';
const now = new Date('2026-10-29T15:00:00Z');
const old = new Date('2026-10-29T13:00:00Z');
test('artifact cleanup respects grace period, references and all live job leases', () => {
  assert.equal(artifactCleanupEligible({ createdAt: old, referenced: false, job: null }, now), true);
  assert.equal(artifactCleanupEligible({ createdAt: new Date(now.getTime() - 1000), referenced: false, job: null }, now), false);
  assert.equal(artifactCleanupEligible({ createdAt: old, referenced: true, job: null }, now), false);
  assert.equal(artifactCleanupEligible({ createdAt: old, referenced: false, job: { status: 'leased', leaseExpiresAt: new Date(now.getTime() + 1000) } }, now), false);
  assert.equal(artifactCleanupEligible({ createdAt: old, referenced: false, job: { status: 'leased', leaseExpiresAt: old } }, now), true);
  assert.equal(artifactCleanupEligible({ createdAt: old, referenced: false, job: { status: 'done', leaseExpiresAt: null } }, now), true);
  assert.throws(() => artifactCleanupEligible({ createdAt: old, referenced: false, job: null }, now, 0), /INVALID_ARTIFACT_GRACE/);
});
test('artifact reservations never accept traversal or another owner prefix', () => {
  const owner = '1f22c8e0-615d-4be2-9a4c-54d2eb616122';
  assert.equal(validateArtifactOwnerKey(owner, `${owner}/7fba7858-f310-46ed-8498-a2285d0b79c1.enc`), true);
  assert.equal(validateArtifactOwnerKey(owner, `../${owner}/7fba7858-f310-46ed-8498-a2285d0b79c1.enc`), false);
  assert.equal(validateArtifactOwnerKey('c012cc85-4869-42db-b692-2f814b96502e', `${owner}/7fba7858-f310-46ed-8498-a2285d0b79c1.enc`), false);
});
