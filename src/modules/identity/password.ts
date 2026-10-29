import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const options = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(value: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(value, salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const pepper = process.env.PASSWORD_PEPPER ?? "";
  const key = await scrypt(`${password}${pepper}`, salt);
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelization, saltValue, keyValue] = encoded.split("$");
  if (algorithm !== "scrypt" || cost !== "16384" || blockSize !== "8" || parallelization !== "1" || !saltValue || !keyValue) return false;
  const expected = Buffer.from(keyValue, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await scrypt(`${password}${process.env.PASSWORD_PEPPER ?? ""}`, Buffer.from(saltValue, "base64url"));
  return timingSafeEqual(actual, expected);
}

export async function burnPasswordCheck(password: string): Promise<void> {
  await scrypt(`${password}${process.env.PASSWORD_PEPPER ?? ""}`, Buffer.from("tndocs-invalid-account-check", "utf8").subarray(0, 16));
}
