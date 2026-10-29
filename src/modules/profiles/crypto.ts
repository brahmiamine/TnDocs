import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_VERSION = "v1";

function encryptionKey() {
  const encoded = process.env.PROFILE_ENCRYPTION_KEY_V1;
  if (!encoded) throw new Error("Profile encryption key is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Profile encryption key must be 32 bytes");
  return key;
}

export function encryptProfileData(value: unknown, ownerId: string, profileId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${ownerId}:${profileId}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: [KEY_VERSION, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join("."), keyVersion: KEY_VERSION };
}

export function decryptProfileData<T>(encoded: string, keyVersion: string, ownerId: string, profileId: string): T {
  const [storedVersion, ivValue, tagValue, ciphertextValue] = encoded.split(".");
  if (storedVersion !== KEY_VERSION || keyVersion !== KEY_VERSION || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported profile encryption key version");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(Buffer.from(`${ownerId}:${profileId}`, "utf8"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
