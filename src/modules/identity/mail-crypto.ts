import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const encoded = process.env.IDENTITY_ENCRYPTION_KEY_V1;
  if (!encoded || Buffer.from(encoded, "base64").length !== 32) throw new Error("IDENTITY_ENCRYPTION_NOT_CONFIGURED");
  return Buffer.from(encoded, "base64");
}
export function encryptIdentityMessage(ownerId: string, scopeId: string, value: unknown) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`tndocs:identity-mail:v1:${ownerId}:${scopeId}`));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}
export function decryptIdentityMessage<T>(ownerId: string, scopeId: string, value: string): T {
  const [version, nonce, tag, body, extra] = value.split(".");
  if (version !== "v1" || !nonce || !tag || !body || extra) throw new Error("INVALID_IDENTITY_MAIL");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`tndocs:identity-mail:v1:${ownerId}:${scopeId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")) as T;
}
