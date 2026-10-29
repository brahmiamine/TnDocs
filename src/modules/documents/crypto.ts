import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_VERSION = "v1";

function encryptionKey() {
  const encoded = process.env.DOCUMENT_ENCRYPTION_KEY_V1;
  if (!encoded) throw new Error("Document encryption key is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Document encryption key must be 32 bytes");
  return key;
}

export function encryptDocumentData(value: unknown, ownerId: string, documentId: string, revision: number) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${ownerId}:${documentId}:${revision}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext: [KEY_VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join("."), keyVersion: KEY_VERSION };
}

export function decryptDocumentData<T>(encoded: string, keyVersion: string, ownerId: string, documentId: string, revision: number): T {
  const [storedVersion, ivValue, tagValue, ciphertextValue] = encoded.split(".");
  if (storedVersion !== KEY_VERSION || keyVersion !== KEY_VERSION || !ivValue || !tagValue || !ciphertextValue) throw new Error("Unsupported document encryption key version");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(Buffer.from(`${ownerId}:${documentId}:${revision}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}

export function encryptDossierData(value: unknown, ownerId: string, recordId: string) {
  return encryptDocumentData(value, ownerId, recordId, 0);
}

export function decryptDossierData<T>(encoded: string, keyVersion: string, ownerId: string, recordId: string): T {
  return decryptDocumentData<T>(encoded, keyVersion, ownerId, recordId, 0);
}
