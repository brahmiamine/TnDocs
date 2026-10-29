export function cliArguments(values: string[], allowed: readonly string[]) {
  const args = new Map<string, string | true>();
  for (let index = 0; index < values.length; index++) {
    const option = values[index]; if (!allowed.includes(option) || args.has(option)) throw new Error('INVALID_BACKUP_ARGUMENTS');
    if (option === '--quiesced' || option === '--upload') { args.set(option, true); continue; }
    const value = values[++index]; if (!value || value.startsWith('--')) throw new Error('INVALID_BACKUP_ARGUMENTS'); args.set(option, value);
  }
  return args;
}
export function cliPath(args: Map<string, string | true>, key: string) { const value = args.get(key); if (typeof value !== 'string') throw new Error(`REQUIRED_${key.slice(2).replaceAll('-', '_').toUpperCase()}`); return value; }
export function cliLimits(args: Map<string, string | true>) {
  const result: { maxArchiveBytes?: number; maxFileBytes?: number } = {};
  if (args.has('--max-bytes')) result.maxArchiveBytes = Number(args.get('--max-bytes'));
  if (args.has('--max-file-bytes')) result.maxFileBytes = Number(args.get('--max-file-bytes'));
  return result;
}
