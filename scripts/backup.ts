import 'dotenv/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { backupKey } from '../src/platform/backup/crypto';
import { createEncryptedBackup } from '../src/platform/backup/archive';
import { dumpDatabase, uploadBackup } from '../src/platform/backup/database';
import { cliArguments, cliLimits, cliPath } from '../src/platform/backup/cli';
async function main() {
  const args = cliArguments(process.argv.slice(2), ['--output', '--quiesced', '--upload', '--max-bytes', '--max-file-bytes']);
  const outputPath = resolve(cliPath(args, '--output')); const key = backupKey();
  if (args.get('--quiesced') !== true) throw new Error('STOP_APPLICATION_WRITES_AND_PASS_QUIESCED');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  const temporary = await mkdtemp(join(tmpdir(), 'tndocs-backup-dump-'));
  try {
    const dump = await dumpDatabase(process.env.DATABASE_URL, temporary);
    const manifest = await createEncryptedBackup({ databaseDumpPath: dump, storageRoot: process.env.STORAGE_ROOT ?? './.data/storage', outputPath, key, limits: cliLimits(args) });
    if (args.get('--upload') === true) await uploadBackup(outputPath);
    process.stdout.write(JSON.stringify({ status: 'encrypted_backup_created', output: outputPath, files: manifest.entries.length, excludedSymlinks: manifest.excludedSymlinks, offsite: args.get('--upload') === true ? 'command_succeeded_restore_unverified' : 'not_configured_or_not_requested' }) + '\n');
  } finally { key.fill(0); await rm(temporary, { recursive: true, force: true }); }
}
main().catch(() => { process.stderr.write('BACKUP_FAILED: vérifiez les paramètres, permissions, espace disque et configuration MariaDB. Aucun secret n’est affiché.\n'); process.exitCode = 1; });
