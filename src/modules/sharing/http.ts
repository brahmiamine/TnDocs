import { NextResponse } from "next/server";
import { ShareError } from "./service";
export function shareFailure(error: unknown) {
  const status = error instanceof ShareError ? error.status : error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED" ? 413 : 503;
  const code = error instanceof ShareError ? error.code : status === 413 ? "STORAGE_QUOTA_EXCEEDED" : "SHARE_UNAVAILABLE";
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
