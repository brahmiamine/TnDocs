import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { env } from "@/platform/config/env";

function rootPath() {
  return resolve(env.STORAGE_ROOT);
}

export function attachmentStorageKey(ownerId: string, fileId: string) {
  return `${ownerId}/${fileId}.enc`;
}

function getPath(storageKey: string) {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.enc$/i.test(storageKey)) throw new Error("Invalid storage key");
  const root = rootPath();
  const path = resolve(root, storageKey);
  if (!isAbsolute(path) || !path.startsWith(`${root}${sep}`)) throw new Error("Storage path escapes the configured root");
  return path;
}

export async function writeEncryptedAttachment(storageKey: string, payload: Buffer) {
  const path = getPath(storageKey);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tempPath = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, payload, { mode: 0o600, flag: "wx" });
    await rename(tempPath, path);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

export async function readEncryptedAttachment(storageKey: string) {
  return readFile(getPath(storageKey));
}

export async function deleteStoredAttachment(storageKey: string) {
  await unlink(getPath(storageKey)).catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return;
    throw error;
  });
}
