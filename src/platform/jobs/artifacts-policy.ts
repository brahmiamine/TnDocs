import { validStorageKey } from '@/platform/storage/local';
export const artifactGraceMs = 60 * 60 * 1000;
export function validateArtifactOwnerKey(ownerId: string | null | undefined, storageKey: string) {
  return !!ownerId && validStorageKey(storageKey) && storageKey.startsWith(`${ownerId}/`);
}
export function artifactCleanupEligible(input: { createdAt: Date; referenced: boolean; job: { status: string; leaseExpiresAt: Date | null } | null }, now: Date, graceMs = artifactGraceMs) {
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(input.createdAt.getTime())) throw new Error('INVALID_ARTIFACT_DATE');
  if (!Number.isFinite(graceMs) || graceMs <= 0) throw new Error('INVALID_ARTIFACT_GRACE');
  if (input.referenced || input.createdAt.getTime() + graceMs > now.getTime()) return false;
  return !(input.job?.status === 'leased' && input.job.leaseExpiresAt && input.job.leaseExpiresAt.getTime() > now.getTime());
}
