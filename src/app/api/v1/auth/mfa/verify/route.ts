import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { isRateLimited } from "@/modules/identity/rate-limit";
import { verifySecondFactor } from "@/modules/identity/mfa";
const schema = z.object({ code: z.string().trim().min(6).max(40), enrollment: z.boolean().default(false) });
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = schema.safeParse(await readJsonBody(request));
  if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  if (await isRateLimited(createHash("sha256").update(`mfa:${user.id}`).digest("hex"), 8, 15 * 60_000)) return NextResponse.json({ code: "RATE_LIMITED" }, { status: 429, headers: { "Retry-After": "900" } });
  if (input.data.enrollment && !user.mfaEnabled && Date.now() - user.sessionCreatedAt.getTime() > 10 * 60_000) return NextResponse.json({ code: "REAUTHENTICATION_REQUIRED" }, { status: 403 });
  try {
    const result = await verifySecondFactor(user.id, user.sessionId, input.data.code, input.data.enrollment && !user.mfaEnabled);
    return NextResponse.json(result.verified ? { status: "verified", ...result } : { code: "INVALID_CODE" }, { status: result.verified ? 200 : 401, headers: { "Cache-Control": "no-store" } });
  } catch { return serviceUnavailable(); }
}
