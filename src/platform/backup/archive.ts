import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readdir, mkdir, mkdtemp, open, readFile, rename, rm, realpath } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { encryptArchive, decryptToSpool, archiveReadStream } from './crypto';
import { archiveMagic, backupLimits, parseEntry, safeArchivePath, sha256, validateManifest, type BackupEntry, type BackupLimits, type BackupManifest } from './format';
export { safeArchivePath } from './format';
export type { BackupManifest, BackupLimits } from './format';
async function* sourceChunks(path: string) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { if (!(await file.stat()).isFile()) throw new Error('BACKUP_REGULAR_FILE_REQUIRED'); for await (const chunk of file.createReadStream({ autoClose: false, highWaterMark: 64 * 1024 })) yield Buffer.from(chunk); }
  finally { await file.close(); }
}
async function describeFile(path: string, archivePath: string, limits: BackupLimits): Promise<BackupEntry> {
  const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('BACKUP_REGULAR_FILE_REQUIRED');
  if (stat.size > limits.maxFileBytes) throw new Error('BACKUP_FILE_SIZE_LIMIT');
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of sourceChunks(path)) { size += chunk.length; if (size > limits.maxFileBytes) throw new Error('BACKUP_FILE_SIZE_LIMIT'); hash.update(chunk); }
  return { path: archivePath, size, sha256: hash.digest('hex') };
}
function frame(entry: BackupEntry) { const value = Buffer.from(JSON.stringify(entry)); const length = Buffer.alloc(4); length.writeUInt32BE(value.length); return [length, value]; }
export async function createEncryptedBackup(input: { databaseDumpPath: string; storageRoot: string; outputPath: string; key: Uint8Array; limits?: Partial<BackupLimits> }): Promise<BackupManifest> {
  const limits = backupLimits(input.limits); const storage = resolve(input.storageRoot);
  if (resolve(input.outputPath).startsWith(`${storage}${sep}`)) throw new Error('BACKUP_OUTPUT_INSIDE_STORAGE');
  const rootStat = await lstat(storage); if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await realpath(storage) !== storage) throw new Error('UNSAFE_BACKUP_STORAGE_ROOT');
  const files: { source: string; entry: BackupEntry }[] = [{ source: input.databaseDumpPath, entry: await describeFile(input.databaseDumpPath, 'database.sql', limits) }];
  let excludedSymlinks = 0;
  async function walk(directory: string, relative: string) {
    if (await realpath(directory) !== resolve(directory)) throw new Error('UNSAFE_BACKUP_STORAGE_DIRECTORY');
    const children = await readdir(directory, { withFileTypes: true }); children.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const child of children) {
      const path = join(directory, child.name); const key = relative ? `${relative}/${child.name}` : child.name;
      const stat = await lstat(path);
      if (stat.isSymbolicLink()) { excludedSymlinks++; continue; }
      if (stat.isDirectory()) { await walk(path, key); continue; }
      // StorageAdapter persists encrypted objects only; unfinished atomic-write files are not objects.
      if (!stat.isFile() || !child.name.endsWith('.enc')) continue;
      const archivePath = `storage/${key}`; if (!safeArchivePath(archivePath)) throw new Error('INVALID_BACKUP_STORAGE_PATH');
      if (files.length >= limits.maxEntries) throw new Error('BACKUP_ENTRY_COUNT_LIMIT');
      files.push({ source: path, entry: await describeFile(path, archivePath, limits) });
    }
  }
  await walk(storage, '');
  const manifest: BackupManifest = { format: 'tndocs-backup-v1', createdAt: new Date().toISOString(), entries: files.map(file => file.entry), excludedSymlinks };
  const manifestBytes = Buffer.from(JSON.stringify(manifest)); if (manifestBytes.length > limits.maxManifestBytes) throw new Error('BACKUP_MANIFEST_SIZE_LIMIT');
  async function* archive() {
    yield archiveMagic;
    for (const file of files) {
      yield* frame(file.entry); const hash = createHash('sha256'); let size = 0;
      for await (const chunk of sourceChunks(file.source)) { size += chunk.length; if (size > file.entry.size) throw new Error('BACKUP_SOURCE_CHANGED'); hash.update(chunk); yield chunk; }
      if (size !== file.entry.size || hash.digest('hex') !== file.entry.sha256) throw new Error('BACKUP_SOURCE_CHANGED');
    }
    yield* frame({ path: 'manifest.json', size: manifestBytes.length, sha256: sha256(manifestBytes) }); yield manifestBytes; yield Buffer.alloc(4);
  }
  async function* boundedArchive() { let bytes = 0; for await (const chunk of archive()) { bytes += chunk.length; if (bytes > limits.maxArchiveBytes) throw new Error('BACKUP_SIZE_LIMIT'); yield chunk; } }
  await encryptArchive(boundedArchive(), resolve(input.outputPath), input.key); return manifest;
}
class ByteReader {
  private readonly iterator: AsyncIterator<Buffer>;
  private chunk: Buffer = Buffer.alloc(0); private offset = 0;
  constructor(source: AsyncIterable<Buffer>) { this.iterator = source[Symbol.asyncIterator](); }
  async take(maximum: number): Promise<Buffer | null> {
    while (this.offset >= this.chunk.length) { const next = await this.iterator.next(); if (next.done) return null; this.chunk = next.value; this.offset = 0; }
    const count = Math.min(maximum, this.chunk.length - this.offset); const result = this.chunk.subarray(this.offset, this.offset + count); this.offset += count; return result;
  }
  async exact(size: number) { const chunks: Buffer[] = []; let remaining = size; while (remaining) { const chunk = await this.take(remaining); if (!chunk) throw new Error('TRUNCATED_BACKUP_ARCHIVE'); chunks.push(chunk); remaining -= chunk.length; } return Buffer.concat(chunks, size); }
  async *content(size: number) { let remaining = size; while (remaining) { const chunk = await this.take(Math.min(remaining, 64 * 1024)); if (!chunk) throw new Error('TRUNCATED_BACKUP_ARCHIVE'); remaining -= chunk.length; yield chunk; } }
}
async function extractArchive(spool: string, stage: string, limits: BackupLimits) {
  const source = archiveReadStream(spool); const reader = new ByteReader(source);
  try {
    if (!(await reader.exact(archiveMagic.length)).equals(archiveMagic)) throw new Error('INVALID_BACKUP_ARCHIVE');
    const actual: BackupEntry[] = []; const paths = new Set<string>(); let manifest: BackupManifest | null = null;
    while (true) {
      const length = (await reader.exact(4)).readUInt32BE(); if (length === 0) break;
      if (length > 64 * 1024 || manifest) throw new Error('INVALID_BACKUP_ENTRY');
      let metadata: unknown; try { metadata = JSON.parse((await reader.exact(length)).toString('utf8')); } catch { throw new Error('INVALID_BACKUP_ENTRY'); }
      const entry = parseEntry(metadata); if (paths.has(entry.path)) throw new Error('DUPLICATE_BACKUP_PATH'); paths.add(entry.path);
      if (entry.size > (entry.path === 'manifest.json' ? limits.maxManifestBytes : limits.maxFileBytes)) throw new Error('BACKUP_FILE_SIZE_LIMIT');
      if (actual.length >= limits.maxEntries && entry.path !== 'manifest.json') throw new Error('BACKUP_ENTRY_COUNT_LIMIT');
      const target = resolve(stage, entry.path); if (!target.startsWith(`${stage}${sep}`)) throw new Error('INVALID_BACKUP_ENTRY');
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const file = await open(target, 'wx', 0o600); const hash = createHash('sha256');
      try { for await (const chunk of reader.content(entry.size)) { hash.update(chunk); await file.writeFile(chunk); } } finally { await file.close(); }
      if (hash.digest('hex') !== entry.sha256) throw new Error('BACKUP_FILE_HASH_MISMATCH');
      if (entry.path === 'manifest.json') {
        let value: unknown; try { value = JSON.parse(await readFile(target, 'utf8')); } catch { throw new Error('INVALID_BACKUP_MANIFEST'); }
        manifest = validateManifest(value, actual, limits.maxEntries);
      } else actual.push(entry);
    }
    if (await reader.take(1)) throw new Error('TRAILING_BACKUP_BYTES');
    if (!manifest) throw new Error('BACKUP_MANIFEST_MISSING'); return manifest;
  } finally { source.destroy(); }
}
async function ensureEmptyDestination(path: string) {
  try { const stat = await lstat(path); if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('UNSAFE_RESTORE_DESTINATION'); if ((await readdir(path)).length) throw new Error('DESTINATION_NOT_EMPTY'); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function restoreEncryptedBackup(input: { backupPath: string; destination: string; key: Uint8Array; limits?: Partial<BackupLimits> }): Promise<BackupManifest> {
  const limits = backupLimits(input.limits); const destination = resolve(input.destination); await ensureEmptyDestination(destination);
  const temporary = await mkdtemp(join(tmpdir(), 'tndocs-backup-auth-')); let stage: string | null = null;
  try {
    const spool = join(temporary, 'verified.archive'); await decryptToSpool(input.backupPath, spool, input.key, limits.maxArchiveBytes);
    stage = await mkdtemp(join(dirname(destination), '.tndocs-restore-'));
    const manifest = await extractArchive(spool, stage, limits);
    // Recheck immediately before publication; never overwrite an existing populated directory.
    await ensureEmptyDestination(destination); await rename(stage, destination); stage = null;
    return manifest;
  } finally { if (stage) await rm(stage, { recursive: true, force: true }); await rm(temporary, { recursive: true, force: true }); }
}
