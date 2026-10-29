import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { guideSchema } from "@/modules/procedures/schema";
import { publishGuide } from "@/modules/procedures/service";
import { procedureGuides, procedureGuideVersions } from "@/modules/procedures/db-schema";
const schema = z.object({ id: z.string().uuid().optional(), expectedVersion: z.number().int().min(0), content: guideSchema, verifiedAt: z.string().datetime().transform(value => new Date(value)).refine(value => value <= new Date(), "Verification cannot be in the future"), reviewConfirmed: z.literal(true) }).strict();
export async function GET() {
  const { user, reason } = await userHasRole("moderator"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const rows = await database.select({ id: procedureGuides.id, currentVersion: procedureGuides.currentVersion, publishedVersion: procedureGuides.publishedVersion, content: procedureGuideVersions.content, verifiedAt: procedureGuideVersions.verifiedAt }).from(procedureGuides).innerJoin(procedureGuideVersions, and(eq(procedureGuides.id, procedureGuideVersions.guideId), eq(procedureGuides.currentVersion, procedureGuideVersions.version))).orderBy(desc(procedureGuides.updatedAt)).limit(200);
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const input = schema.safeParse(await readJsonBody(request, 512 * 1024)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT", fields: input.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await publishGuide(input.data, user.id), { status: 201 }); }
  catch (error) { const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "PUBLICATION_FAILED"; return NextResponse.json({ code }, { status: 409 }); }
}
