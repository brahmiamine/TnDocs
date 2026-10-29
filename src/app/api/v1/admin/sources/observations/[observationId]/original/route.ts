import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { registeredSources, sourceObservations } from "@/modules/sources/db-schema";
import { readSourceOriginal } from "@/modules/sources/originals";
export async function GET(_request: Request, { params }: { params: Promise<{ observationId: string }> }) {
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { observationId } = await params;
  const [row] = await database.select({ observation: sourceObservations }).from(sourceObservations).innerJoin(registeredSources, eq(registeredSources.id, sourceObservations.sourceId)).where(and(eq(sourceObservations.id, observationId), eq(registeredSources.reusePermission, "allowed"), eq(registeredSources.approved, 1))).limit(1);
  const observation = row?.observation;
  if (!observation?.originalStorageKey || !observation.originalKeyVersion) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  try {
    const bytes = await readSourceOriginal(observation.sourceId, observation.id, observation.originalStorageKey, observation.originalKeyVersion);
    return new Response(Uint8Array.from(bytes), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="source-${observation.id}.${observation.mimeType === "application/pdf" ? "pdf" : "docx"}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ code: "SOURCE_ORIGINAL_UNAVAILABLE" }, { status: 503 }); }
}
