import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_VERSION = "v1";

function encryptionKey() {
  const encoded = process.env.ATTACHMENT_ENCRYPTION_KEY_V1;
  if (!encoded) throw new Error("Attachment encryption key is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Attachment encryption key must be 32 bytes");
  return key;
}

export function encryptAttachment(value: Buffer, ownerId: string, fileId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${ownerId}:${fileId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { payload: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), keyVersion: KEY_VERSION };
}

export function decryptAttachment(payload: Buffer, keyVersion: string, ownerId: string, fileId: string) {
  if (keyVersion !== KEY_VERSION || payload.byteLength < 28) throw new Error("Unsupported attachment encryption format");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), payload.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${ownerId}:${fileId}`, "utf8"));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
}
