import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { sourceObservations } from "@/modules/sources/db-schema";
const schema = z.object({ status: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().min(3).max(3000) }).strict();
export async function PATCH(request: Request, { params }: { params: Promise<{ observationId: string }> }) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const input = schema.safeParse(await readJsonBody(request)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { observationId } = await params;
  const result = await database.update(sourceObservations).set({ ...input.data, reviewedBy: user.id, reviewedAt: new Date() }).where(and(eq(sourceObservations.id, observationId), eq(sourceObservations.status, "pending")));
  return NextResponse.json(result[0].affectedRows ? { status: input.data.status } : { code: "REVIEW_CONFLICT" }, { status: result[0].affectedRows ? 200 : 409 });
}
