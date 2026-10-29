import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
function quoted(value: string) { if (value.includes('\0')) throw new Error('INVALID_DATABASE_CONFIGURATION'); return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`; }
export function dumpConfiguration(databaseUrl: string) {
  let url: URL; try { url = new URL(databaseUrl); } catch { throw new Error('INVALID_DATABASE_CONFIGURATION'); }
  const database = url.pathname.slice(1);
  if (url.protocol !== 'mysql:' || !/^[A-Za-z0-9_]+$/.test(database) || !url.hostname || url.search || url.hash) throw new Error('INVALID_DATABASE_CONFIGURATION');
  let user: string, password: string; try { user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); } catch { throw new Error('INVALID_DATABASE_CONFIGURATION'); }
  const port = url.port ? Number(url.port) : 3306; if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('INVALID_DATABASE_CONFIGURATION');
  return { database, config: `[client]\nuser=${quoted(user)}\npassword=${quoted(password)}\nhost=${quoted(url.hostname)}\nport=${port}\nprotocol=tcp\n` };
}
/** The caller owns a new mode0700 directory and removes it after encrypting the dump. */
export async function dumpDatabase(databaseUrl: string, temporaryDirectory: string) {
  const { config, database } = dumpConfiguration(databaseUrl);
  const configPath = join(temporaryDirectory, 'client.cnf'); const outputPath = join(temporaryDirectory, 'database.sql');
  await writeFile(configPath, config, { mode: 0o600, flag: 'wx' });
  const child = spawn('mariadb-dump', [`--defaults-extra-file=${configPath}`, '--single-transaction', '--quick', '--skip-lock-tables', '--hex-blob', '--routines', '--events', '--triggers', '--databases', database], { stdio: ['ignore', 'pipe', 'ignore'] });
  const completion = new Promise<void>((resolve, reject) => { child.once('error', () => reject(new Error('DATABASE_DUMP_EXECUTABLE_UNAVAILABLE'))); child.once('close', code => code === 0 ? resolve() : reject(new Error('DATABASE_DUMP_FAILED'))); });
  try { await Promise.all([pipeline(child.stdout, createWriteStream(outputPath, { flags: 'wx', mode: 0o600 })), completion]); }
  catch { child.kill('SIGTERM'); throw new Error('DATABASE_DUMP_FAILED'); }
  return outputPath;
}
/** Explicit optional operator integration. No shell interpolation and no configured provider by default. */
export async function uploadBackup(backupPath: string, configured = process.env.BACKUP_OFFSITE_COMMAND) {
  if (!configured) throw new Error('OFFSITE_DESTINATION_NOT_CONFIGURED');
  let argv: unknown; try { argv = JSON.parse(configured); } catch { throw new Error('INVALID_OFFSITE_COMMAND'); }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some(value => typeof value !== 'string' || !value || value.includes('\0')) || !argv.some(value => value.includes('{backup}'))) throw new Error('INVALID_OFFSITE_COMMAND');
  const [executable, ...args] = (argv as string[]).map(value => value.replaceAll('{backup}', backupPath));
  const child = spawn(executable, args, { shell: false, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => { child.once('error', () => reject(new Error('OFFSITE_UPLOAD_FAILED'))); child.once('close', code => code === 0 ? resolve() : reject(new Error('OFFSITE_UPLOAD_FAILED'))); });
}
