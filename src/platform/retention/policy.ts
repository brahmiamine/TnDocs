export const TRASH_RETENTION_DAYS = 30;
export function trashPurgeAfter(trashedAt: Date) {
  if (!Number.isFinite(trashedAt.getTime())) throw new Error("INVALID_TRASH_DATE");
  return new Date(trashedAt.getTime() + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
export function canPurgeTrash(resource: { status: string; purgeAfter: Date }, now: Date) {
  return resource.status === "trash" && Number.isFinite(resource.purgeAfter.getTime()) && resource.purgeAfter.getTime() <= now.getTime();
}
export function accountStorageQuota(value = process.env.ACCOUNT_STORAGE_QUOTA_BYTES) {
  if (value === undefined) return 100 * 1024 * 1024;
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new Error("INVALID_ACCOUNT_STORAGE_QUOTA");
  return bytes;
}
export function canStoreBytes({ used, incoming, replacement = 0, quota }: { used: number; incoming: number; replacement?: number; quota: number }) {
  return [used, incoming, replacement, quota].every((value) => Number.isSafeInteger(value) && value >= 0) && replacement <= used && used - replacement + incoming <= quota;
}
export function exportArtifactExpired(job: { kind: string; status: string; updatedAt: Date }, now: Date, ttlHours: number) {
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) throw new Error("INVALID_EXPORT_TTL");
  return ["document.export", "signature.export"].includes(job.kind) && ["done", "dead", "cancelled"].includes(job.status) && Number.isFinite(job.updatedAt.getTime()) && now.getTime() - job.updatedAt.getTime() >= ttlHours * 60 * 60 * 1000;
}
