import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { deleteSourceOriginal } from "@/modules/sources/originals";
import { registeredSources, sourceObservations } from "@/modules/sources/db-schema";
const patch = z.object({ approved: z.boolean(), active: z.boolean(), reusePermission: z.enum(["pending", "allowed", "no_reproduction", "forbidden"]), frequencyDays: z.number().int().min(1).max(365) }).strict();
export async function GET(_request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const { user, reason } = await userHasRole("moderator"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { sourceId } = await params;
  const [source] = await database.select().from(registeredSources).where(eq(registeredSources.id, sourceId)).limit(1);
  if (!source) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const observations = await database.select().from(sourceObservations).where(eq(sourceObservations.sourceId, sourceId)).orderBy(desc(sourceObservations.createdAt)).limit(100);
  const visibleObservations = source.reusePermission === "allowed" ? observations : observations.map(observation => ({ ...observation, textPreview: "", extractedText: null, originalStorageKey: null, originalKeyVersion: null }));
  return NextResponse.json({ source, observations: visibleObservations }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const input = patch.safeParse(await readJsonBody(request)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { sourceId } = await params;
  const result = await database.update(registeredSources).set({ approved: input.data.approved ? 1 : 0, active: input.data.active ? 1 : 0, reusePermission: input.data.reusePermission, frequencyDays: input.data.frequencyDays }).where(and(eq(registeredSources.id, sourceId)));
  if (result[0].affectedRows && input.data.reusePermission !== "allowed") {
    const snapshots = await database.select().from(sourceObservations).where(eq(sourceObservations.sourceId, sourceId));
    try {
      for (const snapshot of snapshots) if (snapshot.originalStorageKey) await deleteSourceOriginal(snapshot.originalStorageKey);
      await database.update(sourceObservations).set({ textPreview: "", extractedText: null, originalStorageKey: null, originalKeyVersion: null }).where(eq(sourceObservations.sourceId, sourceId));
    } catch { return NextResponse.json({ code: "SOURCE_REPRODUCTION_REVOKED_CLEANUP_PENDING" }, { status: 503 }); }
  }
  return NextResponse.json(result[0].affectedRows ? { status: "updated" } : { code: "NOT_FOUND" }, { status: result[0].affectedRows ? 200 : 404 });
}
