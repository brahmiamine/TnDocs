import { constants } from "node:fs";
import { mkdir, open, rename, unlink, lstat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { StorageAdapter } from "./adapter";

export function validStorageKey(key: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.enc$/i.test(key); }

export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;
  constructor(root: string) { this.root = resolve(root); }
  private path(key: string) {
    if (!validStorageKey(key)) throw new Error("INVALID_STORAGE_KEY");
    const result = resolve(this.root, key);
    if (!result.startsWith(`${this.root}${sep}`)) throw new Error("INVALID_STORAGE_KEY");
    return result;
  }
  private async directory(path: string) {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const info = await lstat(dir);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("UNSAFE_STORAGE_DIRECTORY");
  }
  async put(key: string, data: Uint8Array) {
    const path = this.path(key); await this.directory(path);
    const temp = join(dirname(path), `.${basename(path)}.tmp`);
    let created = false;
    try {
      const file = await open(temp, "wx", 0o600); created = true;
      try { await file.writeFile(data); await file.sync(); } finally { await file.close(); }
      await rename(temp, path);
    } catch (error) { if (created) await unlink(temp).catch(() => undefined); throw error; }
  }
  async getStream(key: string) {
    const path = this.path(key);
    const parent = await lstat(dirname(path));
    if (parent.isSymbolicLink() || !parent.isDirectory()) throw new Error("UNSAFE_STORAGE_DIRECTORY");
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    return file.createReadStream({ autoClose: true });
  }
  async delete(key: string) {
    const path = this.path(key);
    try {
      const parent = await lstat(dirname(path));
      if (parent.isSymbolicLink() || !parent.isDirectory()) throw new Error("UNSAFE_STORAGE_DIRECTORY");
      await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      await unlink(join(dirname(path), `.${basename(path)}.tmp`)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  async copy(sourceKey: string, destinationKey: string) {
    const chunks: Buffer[] = [];
    for await (const chunk of await this.getStream(sourceKey)) chunks.push(Buffer.from(chunk));
    await this.put(destinationKey, Buffer.concat(chunks));
  }
  async exists(key: string) {
    const path = this.path(key);
    try {
      const parent = await lstat(dirname(path));
      if (parent.isSymbolicLink() || !parent.isDirectory()) return false;
      const info = await lstat(path); return info.isFile() && !info.isSymbolicLink();
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }
}
