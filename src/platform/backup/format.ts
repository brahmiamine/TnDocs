import { createHash } from 'node:crypto';
export const envelopeMagic = Buffer.from('TNDOCS-BACKUP-v1\n');
export const archiveMagic = Buffer.from('TNDOCS-ARCHIVE-v1\n');
export type BackupEntry = { path: string; size: number; sha256: string };
export type BackupManifest = { format: 'tndocs-backup-v1'; createdAt: string; entries: BackupEntry[]; excludedSymlinks: number };
export type BackupLimits = { maxArchiveBytes: number; maxFileBytes: number; maxEntries: number; maxManifestBytes: number };
export function backupLimits(overrides: Partial<BackupLimits> = {}): BackupLimits {
  const limits = { maxArchiveBytes: 16 * 1024 ** 3, maxFileBytes: 4 * 1024 ** 3, maxEntries: 100_000, maxManifestBytes: 32 * 1024 ** 2, ...overrides };
  if (Object.values(limits).some(value => !Number.isSafeInteger(value) || value <= 0)) throw new Error('INVALID_BACKUP_LIMIT');
  return limits;
}
export function safeArchivePath(path: string) {
  if (path === 'database.sql' || path === 'manifest.json') return true;
  if (!path.startsWith('storage/') || path.length > 1024 || path.includes('\\') || /[\u0000-\u001f]/u.test(path)) return false;
  const segments = path.split('/');
  return segments.every(segment => segment !== '' && segment !== '.' && segment !== '..' && !segment.includes(':')) && path.endsWith('.enc');
}
export function sha256(value: Uint8Array) { return createHash('sha256').update(value).digest('hex'); }
export function parseEntry(value: unknown): BackupEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_BACKUP_ENTRY');
  const entry = value as Record<string, unknown>;
  if (Object.keys(entry).sort().join(',') !== 'path,sha256,size' || typeof entry.path !== 'string' || !safeArchivePath(entry.path) || typeof entry.size !== 'number' || !Number.isSafeInteger(entry.size) || entry.size < 0 || typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) throw new Error('INVALID_BACKUP_ENTRY');
  return { path: entry.path, size: entry.size, sha256: entry.sha256 };
}
export function validateManifest(value: unknown, actual: BackupEntry[], maxEntries: number): BackupManifest {
  if (!value || typeof value !== 'object') throw new Error('INVALID_BACKUP_MANIFEST');
  const manifest = value as Record<string, unknown>;
  if (manifest.format !== 'tndocs-backup-v1' || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.entries) || manifest.entries.length > maxEntries || !Number.isSafeInteger(manifest.excludedSymlinks) || Number(manifest.excludedSymlinks) < 0) throw new Error('INVALID_BACKUP_MANIFEST');
  const entries = manifest.entries.map(parseEntry);
  if (entries.length !== actual.length || entries.some((entry, index) => entry.path !== actual[index].path || entry.size !== actual[index].size || entry.sha256 !== actual[index].sha256)) throw new Error('BACKUP_MANIFEST_MISMATCH');
  if (!entries.some(entry => entry.path === 'database.sql')) throw new Error('BACKUP_DATABASE_MISSING');
  return { format: 'tndocs-backup-v1', createdAt: manifest.createdAt, excludedSymlinks: Number(manifest.excludedSymlinks), entries };
}
