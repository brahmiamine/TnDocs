import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { sessions } from "@/platform/database/schema";
import { requireSameOrigin, serviceUnavailable } from "@/modules/identity/http";
import { clearSessionCookie, sessionCookieName } from "@/modules/identity/service";
import { hashSecretToken } from "@/modules/identity/tokens";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  if (!database) return serviceUnavailable();
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (token) await database.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, hashSecretToken(token)));
  const response = NextResponse.json({ status: "signed_out" });
  clearSessionCookie(response);
  return response;
}
