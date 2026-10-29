import test from "node:test";
import assert from "node:assert/strict";
import { decodeBase32, encodeBase32, totpCode, findTotpStep, encryptTotpSecret, decryptTotpSecret, mustUseMfa, recoveryCodeHash, newRecoveryCodes } from "../src/modules/identity/totp";

test("TOTP follows RFC 6238 SHA1 vectors", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  for (const [seconds, expected] of [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]] as const) {
    assert.equal(totpCode(secret, Math.floor(seconds / 30), 8), expected);
  }
});
test("TOTP rejects reuse, malformed codes and times outside tolerance", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890"));
  const step = 40000, code = totpCode(secret, step);
  assert.equal(findTotpStep(secret, code, step * 30000), step);
  assert.equal(findTotpStep(secret, code, step * 30000, step), null);
  assert.equal(findTotpStep(secret, code, (step + 2) * 30000), null);
  assert.equal(findTotpStep(secret, "12345a", step * 30000), null);
});
test("Base32 round trips and rejects invalid characters", () => {
  const bytes = Buffer.from("arabe français العربية");
  assert.deepEqual(decodeBase32(encodeBase32(bytes)), bytes);
  assert.throws(() => decodeBase32("!"));
});
test("TOTP secret is encrypted and bound to its owner", () => {
  process.env.IDENTITY_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 7).toString("base64");
  const value = encryptTotpSecret("owner", "SECRET");
  assert.equal(decryptTotpSecret("owner", value), "SECRET");
  assert.throws(() => decryptTotpSecret("other", value));
  assert.throws(() => decryptTotpSecret("owner", value.slice(0, -2) + "zz"));
});
test("Production privileged accounts require MFA and recovery codes are unique owner-bound hashes", () => {
  assert.equal(mustUseMfa("admin", false, true), true);
  assert.equal(mustUseMfa("moderator", false, true), true);
  assert.equal(mustUseMfa("user", false, true), false);
  assert.equal(mustUseMfa("user", true, false), true);
  const codes = newRecoveryCodes();
  assert.equal(new Set(codes).size, 10);
  assert.notEqual(recoveryCodeHash("one", codes[0]), recoveryCodeHash("two", codes[0]));
  assert.equal(recoveryCodeHash("one", "AB-CD"), recoveryCodeHash("one", "abcd"));
});
