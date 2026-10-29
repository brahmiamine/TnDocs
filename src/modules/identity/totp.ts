import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function encodeBase32(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
export function decodeBase32(secret: string): Buffer {
  let bits = 0, value = 0;
  const result: number[] = [];
  for (const char of secret.replace(/=+$/, "").toUpperCase()) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid Base32 secret");
    value = (value << 5) | digit; bits += 5;
    if (bits >= 8) { result.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(result);
}
export function totpCode(secret: string, step: number, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % (10 ** digits)).toString().padStart(digits, "0");
}
export function findTotpStep(secret: string, code: string, now = Date.now(), lastUsedStep = -1): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(now / 30_000);
  for (const step of [current, current - 1, current + 1]) {
    if (step <= lastUsedStep || step < 0) continue;
    if (timingSafeEqual(Buffer.from(totpCode(secret, step)), Buffer.from(code))) return step;
  }
  return null;
}
export function newTotpSecret() { return encodeBase32(randomBytes(20)); }
function encryptionKey() {
  const raw = process.env.IDENTITY_ENCRYPTION_KEY_V1;
  if (!raw || Buffer.from(raw, "base64").length !== 32) throw new Error("Identity encryption key is not configured");
  return Buffer.from(raw, "base64");
}
export function encryptTotpSecret(userId: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`tndocs:totp:v1:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptTotpSecret(userId: string, encoded: string) {
  const [version, nonce, tag, body, extra] = encoded.split(".");
  if (version !== "v1" || !nonce || !tag || !body || extra) throw new Error("Invalid identity ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "base64url"));
  decipher.setAAD(Buffer.from(`tndocs:totp:v1:${userId}`));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
export function recoveryCodeHash(userId: string, code: string) {
  return createHash("sha256").update(`tndocs:recovery:v1:${userId}:${code.replace(/[\s-]/g, "").toUpperCase()}`).digest("hex");
}
export function newRecoveryCodes() { return Array.from({ length: 10 }, () => randomBytes(10).toString("hex").toUpperCase()); }
export function mustUseMfa(role: string, enabled: boolean, production = process.env.NODE_ENV === "production") {
  return enabled || (production && (role === "admin" || role === "moderator"));
}
