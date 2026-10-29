import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { requireSameOrigin } from "@/modules/identity/http";
import { isFeatureEnabled } from "@/modules/administration/service";
import { enqueueJob } from "@/platform/jobs/queue";
import { registeredSources } from "@/modules/sources/db-schema";
export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  if (!await isFeatureEnabled("sourceWatch")) return NextResponse.json({ code: "SOURCE_FEATURE_DISABLED" }, { status: 503 });
  const { sourceId } = await params;
  const [source] = await database.select().from(registeredSources).where(eq(registeredSources.id, sourceId)).limit(1);
  if (!source) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  if (!source.active || !source.approved || source.reusePermission === "pending" || source.reusePermission === "forbidden") return NextResponse.json({ code: "SOURCE_NOT_APPROVED" }, { status: 409 });
  const job = await enqueueJob({ kind: "source.observe", key: `source:${sourceId}:manual:${Math.floor(Date.now() / 60_000)}`, payload: { sourceId }, ownerUserId: user.id });
  return NextResponse.json({ jobId: job.id, status: job.status }, { status: 202 });
}
