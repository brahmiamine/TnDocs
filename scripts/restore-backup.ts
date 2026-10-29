import 'dotenv/config';
import { resolve } from 'node:path';
import { backupKey } from '../src/platform/backup/crypto';
import { restoreEncryptedBackup } from '../src/platform/backup/archive';
import { cliArguments, cliLimits, cliPath } from '../src/platform/backup/cli';
async function main() {
  const args = cliArguments(process.argv.slice(2), ['--input', '--destination', '--max-bytes', '--max-file-bytes']); const key = backupKey();
  try {
    const destination = resolve(cliPath(args, '--destination'));
    const manifest = await restoreEncryptedBackup({ backupPath: resolve(cliPath(args, '--input')), destination, key, limits: cliLimits(args) });
    process.stdout.write(JSON.stringify({ status: 'isolated_files_restored_and_hashes_verified', destination, files: manifest.entries.length, databaseImported: false }) + '\n');
  } finally { key.fill(0); }
}
main().catch(() => { process.stderr.write('RESTORE_FAILED: vérifiez la clé indépendante, l’intégrité, les limites et une destination nouvelle ou vide. Aucune base n’est importée.\n'); process.exitCode = 1; });
