import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createEncryptedBackup, restoreEncryptedBackup, safeArchivePath } from '../src/platform/backup/archive';

test('encrypted fictive database and storage restore exactly; symlinks and temporary files are excluded', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tndocs-backup-test-'));
  try {
    const storage = join(root, 'storage'); const owner = randomUUID(); const file = `${randomUUID()}.enc`;
    await mkdir(join(storage, owner), { recursive: true }); await writeFile(join(storage, owner, file), 'fictive encrypted object'); await writeFile(join(storage, owner, '.interrupted.tmp'), 'not persistent');
    await writeFile(join(root, 'database.sql'), '-- fictive SQL fixture\nSELECT 1;\n');
    await writeFile(join(root, 'outside-secret'), 'do not archive'); await symlink(join(root, 'outside-secret'), join(storage, owner, 'linked.enc'));
    const key = randomBytes(32); const backup = join(root, 'fictive.backup');
    const manifest = await createEncryptedBackup({ databaseDumpPath: join(root, 'database.sql'), storageRoot: storage, outputPath: backup, key });
    assert.equal(manifest.entries.length, 2); assert.equal(manifest.excludedSymlinks, 1);
    const encrypted = await readFile(backup); assert.equal(encrypted.includes(Buffer.from('fictive encrypted object')), false);
    const destination = join(root, 'restored'); await restoreEncryptedBackup({ backupPath: backup, destination, key });
    assert.equal(await readFile(join(destination, 'database.sql'), 'utf8'), '-- fictive SQL fixture\nSELECT 1;\n');
    assert.equal(await readFile(join(destination, 'storage', owner, file), 'utf8'), 'fictive encrypted object');
    const restoredManifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8')); assert.deepEqual(restoredManifest.entries, manifest.entries);
    await assert.rejects(restoreEncryptedBackup({ backupPath: backup, destination, key }), /DESTINATION_NOT_EMPTY/);
    await assert.rejects(createEncryptedBackup({ databaseDumpPath: join(root, 'database.sql'), storageRoot: storage, outputPath: backup, key }), /BACKUP_OUTPUT_EXISTS/);
    await chmod(backup, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('wrong keys, modified ciphertext and size limits fail without extracting files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tndocs-backup-failure-'));
  try {
    const storage = join(root, 'storage'); await mkdir(storage); await writeFile(join(root, 'database.sql'), '-- fictive');
    const key = randomBytes(32); const backup = join(root, 'fictive.backup'); await createEncryptedBackup({ databaseDumpPath: join(root, 'database.sql'), storageRoot: storage, outputPath: backup, key });
    const destination = join(root, 'restored');
    await assert.rejects(restoreEncryptedBackup({ backupPath: backup, destination, key: randomBytes(32) }), /BACKUP_AUTHENTICATION_FAILED/); await assert.rejects(access(destination));
    const tampered = await readFile(backup); tampered[tampered.length - 20] ^= 1; await writeFile(join(root, 'tampered.backup'), tampered);
    await assert.rejects(restoreEncryptedBackup({ backupPath: join(root, 'tampered.backup'), destination, key }), /BACKUP_AUTHENTICATION_FAILED/); await assert.rejects(access(destination));
    await assert.rejects(restoreEncryptedBackup({ backupPath: backup, destination, key, limits: { maxArchiveBytes: 10 } }), /BACKUP_SIZE_LIMIT/); await assert.rejects(access(destination));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('archive paths reject traversal, absolute and platform-dependent paths', () => {
  for (const path of ['../outside', '/etc/passwd', 'storage/../../file', 'storage/a\\b', 'storage//x', 'storage/./x', 'C:/windows/file', 'unknown.txt']) assert.equal(safeArchivePath(path), false, path);
  assert.equal(safeArchivePath('database.sql'), true); assert.equal(safeArchivePath(`storage/${randomUUID()}/${randomUUID()}.enc`), true);
});

test('authenticated malicious archives cannot traverse paths, create links or bypass entry hashes', async () => {
  const { encryptArchive } = await import('../src/platform/backup/crypto');
  const { archiveMagic, sha256 } = await import('../src/platform/backup/format');
  const root = await mkdtemp(join(tmpdir(), 'tndocs-backup-malformed-'));
  try {
    const key = randomBytes(32);
    const cases = [
      { metadata: { path: '../outside.enc', size: 1, sha256: sha256(Buffer.from('x')) }, body: 'x', error: /INVALID_BACKUP_ENTRY/ },
      { metadata: { path: 'database.sql', size: 1, sha256: sha256(Buffer.from('x')), type: 'symlink' }, body: 'x', error: /INVALID_BACKUP_ENTRY/ },
      { metadata: { path: 'database.sql', size: 1, sha256: sha256(Buffer.from('x')) }, body: 'y', error: /BACKUP_FILE_HASH_MISMATCH/ },
    ];
    for (const [index, scenario] of cases.entries()) {
      const metadata = Buffer.from(JSON.stringify(scenario.metadata)); const length = Buffer.alloc(4); length.writeUInt32BE(metadata.length);
      async function* archive() { yield archiveMagic; yield length; yield metadata; yield Buffer.from(scenario.body); yield Buffer.alloc(4); }
      const backup = join(root, `malformed-${index}.backup`); const destination = join(root, `restored-${index}`);
      await encryptArchive(archive(), backup, key); await assert.rejects(restoreEncryptedBackup({ backupPath: backup, destination, key }), scenario.error); await assert.rejects(access(destination));
    }
    await assert.rejects(access(join(root, 'outside.enc')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('MariaDB credentials are escaped in a private config format rather than executable arguments', async () => {
  const { dumpConfiguration } = await import('../src/platform/backup/database');
  const value = dumpConfiguration('mysql://fictive_user:fictive%22%0A%5Csecret@localhost:3307/fictive_database');
  assert.equal(value.database, 'fictive_database');
  assert.ok(value.config.includes('password="fictive\\"\\n\\\\secret"'));
  assert.throws(() => dumpConfiguration('mysql://fictive@localhost/database?password=x'), /INVALID_DATABASE_CONFIGURATION/);
});
