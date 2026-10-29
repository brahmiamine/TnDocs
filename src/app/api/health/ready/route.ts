import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { env } from "@/platform/config/env";
import { getClamAvReadiness } from "@/modules/dossiers/clamav";

type CheckStatus = "ready" | "unavailable" | "unconfigured" | "outdated";

async function checkDatabase(): Promise<CheckStatus> {
  if (!database) return "unconfigured";
  try { await database.execute(sql`SELECT 1`); return "ready"; }
  catch { return "unavailable"; }
}

async function checkSearch(): Promise<CheckStatus> {
  if (!env.MEILISEARCH_URL) return "unconfigured";
  try {
    const response = await fetch(new URL("/health", env.MEILISEARCH_URL), { cache: "no-store", signal: AbortSignal.timeout(2000) });
    return response.ok ? "ready" : "unavailable";
  } catch { return "unavailable"; }
}

export async function GET() {
  const [databaseStatus, searchStatus, attachmentScanner] = await Promise.all([
    checkDatabase(), checkSearch(), getClamAvReadiness(),
  ]);
  const coreReady = databaseStatus === "ready";
  const degraded = searchStatus === "unavailable" || (env.CLAMAV_HOST !== undefined && attachmentScanner !== "ready");
  return NextResponse.json({
    status: !coreReady ? "unavailable" : degraded ? "degraded" : "ready",
    checks: { database: databaseStatus, search: searchStatus, attachmentScanner },
  }, { status: coreReady ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
