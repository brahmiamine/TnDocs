import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { link, lstat, open, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { envelopeMagic } from './format';
export function backupKey(encoded = process.env.BACKUP_ENCRYPTION_KEY) {
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('BACKUP_KEY_NOT_CONFIGURED');
  const key = Buffer.from(encoded, 'base64'); if (key.length !== 32) throw new Error('INVALID_BACKUP_KEY'); return key;
}
function validateKey(key: Uint8Array) { if (key.byteLength !== 32) throw new Error('INVALID_BACKUP_KEY'); }
export async function encryptArchive(source: AsyncIterable<Uint8Array>, outputPath: string, key: Uint8Array) {
  validateKey(key);
  try { await lstat(outputPath); throw new Error('BACKUP_OUTPUT_EXISTS'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temp = join(dirname(outputPath), `.tndocs-backup-${randomUUID()}.partial`);
  const iv = randomBytes(12); const header = Buffer.concat([envelopeMagic, iv]);
  const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(header);
  let started = false;
  const envelope = new Transform({ transform(chunk, _encoding, callback) { if (!started) { this.push(header); started = true; } this.push(chunk); callback(); }, flush(callback) { if (!started) this.push(header); this.push(cipher.getAuthTag()); callback(); } });
  try {
    await pipeline(Readable.from(source), cipher, envelope, createWriteStream(temp, { flags: 'wx', mode: 0o600 }));
    const file = await open(temp, 'r'); try { await file.sync(); } finally { await file.close(); }
    // Atomic no-overwrite publication: an existing destination is never replaced.
    try { await link(temp, outputPath); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('BACKUP_OUTPUT_EXISTS'); throw error; }
  } finally { await unlink(temp).catch(() => undefined); }
}
/** Authentication completes before the archive decoder sees any plaintext. */
export async function decryptToSpool(backupPath: string, spoolPath: string, key: Uint8Array, maxArchiveBytes: number) {
  validateKey(key);
  const file = await open(backupPath, 'r');
  try {
    const stat = await file.stat(); const headerSize = envelopeMagic.length + 12;
    if (!stat.isFile() || stat.size < headerSize + 16) throw new Error('INVALID_BACKUP_ENVELOPE');
    if (stat.size - headerSize - 16 > maxArchiveBytes) throw new Error('BACKUP_SIZE_LIMIT');
    const header = Buffer.alloc(headerSize); if ((await file.read(header, 0, headerSize, 0)).bytesRead !== headerSize || !header.subarray(0, envelopeMagic.length).equals(envelopeMagic)) throw new Error('INVALID_BACKUP_ENVELOPE');
    const tag = Buffer.alloc(16); await file.read(tag, 0, 16, stat.size - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(envelopeMagic.length)); decipher.setAAD(header); decipher.setAuthTag(tag);
    try { await pipeline(file.createReadStream({ autoClose: false, start: headerSize, end: stat.size - 17 }), decipher, createWriteStream(spoolPath, { flags: 'wx', mode: 0o600 })); }
    catch { throw new Error('BACKUP_AUTHENTICATION_FAILED'); }
  } finally { await file.close(); }
}
export function archiveReadStream(path: string) { return createReadStream(path, { highWaterMark: 64 * 1024 }); }
