import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/platform/config/env";
import { LocalStorageAdapter } from "@/platform/storage/local";
function store() { return new LocalStorageAdapter(`${env.STORAGE_ROOT}/source-originals`); }
function key() {
  const value = process.env.ATTACHMENT_ENCRYPTION_KEY_V1;
  if (!value || Buffer.from(value, "base64").length !== 32) throw new Error("SOURCE_STORAGE_NOT_CONFIGURED");
  return Buffer.from(value, "base64");
}
export async function preserveSourceOriginal(sourceId: string, observationId: string, bytes: Buffer) {
  const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), nonce);
  cipher.setAAD(Buffer.from(`tndocs:source-original:v1:${sourceId}:${observationId}`));
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const storageKey = `${sourceId}/${observationId}.enc`;
  await store().put(storageKey, Buffer.concat([nonce, cipher.getAuthTag(), encrypted]));
  return { storageKey, keyVersion: "v1" };
}
export async function readSourceOriginal(sourceId: string, observationId: string, storageKey: string, keyVersion: string) {
  if (keyVersion !== "v1" || storageKey !== `${sourceId}/${observationId}.enc`) throw new Error("SOURCE_INVALID_ORIGINAL");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of await store().getStream(storageKey)) { size += chunk.length; if (size > 2 * 1024 * 1024 + 28) throw new Error("SOURCE_INVALID_ORIGINAL"); chunks.push(Buffer.from(chunk)); }
  const payload = Buffer.concat(chunks);
  if (payload.length < 28) throw new Error("SOURCE_INVALID_ORIGINAL");
  const decipher = createDecipheriv("aes-256-gcm", key(), payload.subarray(0, 12));
  decipher.setAAD(Buffer.from(`tndocs:source-original:v1:${sourceId}:${observationId}`)); decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}
export function deleteSourceOriginal(storageKey: string) { return store().delete(storageKey); }
