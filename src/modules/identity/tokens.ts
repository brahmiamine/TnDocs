import { createHash, randomBytes } from "node:crypto";

export function createSecretToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashSecretToken(token) };
}

export function hashSecretToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
