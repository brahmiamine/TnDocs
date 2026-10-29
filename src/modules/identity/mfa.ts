import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { requireDatabase } from "./service";
import { identityAuditEvents, recoveryCodes, sessionFactors, userSecondFactors } from "./advanced-schema";
import { decryptTotpSecret, findTotpStep, newRecoveryCodes, recoveryCodeHash } from "./totp";

/** Locks the factor before consuming a time-step or recovery code. No replay wins a race. */
export async function verifySecondFactor(userId: string, sessionId: string, code: string, enrollment = false) {
  return requireDatabase().transaction(async tx => {
    const [factor] = await tx.select().from(userSecondFactors).where(eq(userSecondFactors.userId, userId)).for("update").limit(1);
    if (!factor || (!enrollment && !factor.enabledAt)) return { verified: false as const };
    const step = /^\d{6}$/.test(code) ? findTotpStep(decryptTotpSecret(userId, factor.secretCiphertext), code, Date.now(), factor.lastUsedStep) : null;
    if (step === null) {
      if (enrollment) return { verified: false as const };
      const [recovery] = await tx.select().from(recoveryCodes).where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, recoveryCodeHash(userId, code)), isNull(recoveryCodes.usedAt))).for("update").limit(1);
      if (!recovery) return { verified: false as const };
      await tx.update(recoveryCodes).set({ usedAt: new Date() }).where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, recovery.codeHash), isNull(recoveryCodes.usedAt)));
    } else {
      await tx.update(userSecondFactors).set({ lastUsedStep: step, ...(enrollment ? { enabledAt: new Date() } : {}) }).where(eq(userSecondFactors.userId, userId));
    }
    let codes: string[] | undefined;
    if (enrollment && !factor.enabledAt) {
      codes = newRecoveryCodes();
      await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
      await tx.insert(recoveryCodes).values(codes.map(code => ({ userId, codeHash: recoveryCodeHash(userId, code) })));
    }
    await tx.insert(sessionFactors).values({ sessionId }).onDuplicateKeyUpdate({ set: { verifiedAt: new Date() } });
    await tx.insert(identityAuditEvents).values({ id: randomUUID(), userId, event: enrollment ? "mfa_enabled" : step === null ? "mfa_recovery_used" : "mfa_verified" });
    return { verified: true as const, ...(codes ? { recoveryCodes: codes } : {}) };
  });
}
