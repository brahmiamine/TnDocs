import { eq, sql } from "drizzle-orm";
import { loginAttemptLimits } from "@/platform/database/schema";
import { requireDatabase } from "./service";

export async function isRateLimited(keyHash: string, maximum: number, windowMs: number): Promise<boolean> {
  const db = requireDatabase();
  const [limit] = await db.select().from(loginAttemptLimits).where(eq(loginAttemptLimits.keyHash, keyHash)).limit(1);
  const cutoff = new Date(Date.now() - windowMs);
  const blocked = Boolean(limit && limit.windowStartedAt > cutoff && limit.attempts >= maximum);
  if (blocked) return true;

  await db.insert(loginAttemptLimits).values({ keyHash, attempts: 1, windowStartedAt: new Date() }).onDuplicateKeyUpdate({
    set: {
      attempts: sql`IF(${loginAttemptLimits.windowStartedAt} < ${cutoff}, 1, ${loginAttemptLimits.attempts} + 1)`,
      windowStartedAt: sql`IF(${loginAttemptLimits.windowStartedAt} < ${cutoff}, NOW(), ${loginAttemptLimits.windowStartedAt})`,
    },
  });
  return false;
}
