import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { searchDictionarySchema } from "@/modules/search/policy";
import { getSearchConfiguration, saveSearchConfiguration } from "@/modules/search/service";
import { searchDailyMetrics } from "@/modules/search/db-schema";
const schema = z.object({ expectedRevision: z.number().int().min(0), dictionary: searchDictionarySchema }).strict();
export async function GET() {
  const { user, reason } = await userHasRole("moderator"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  const configuration = await getSearchConfiguration();
  const metrics = database ? await database.select().from(searchDailyMetrics).orderBy(desc(searchDailyMetrics.day)).limit(60) : [];
  return NextResponse.json({ ...configuration, metrics }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  const input = schema.safeParse(await readJsonBody(request, 256 * 1024)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT", fields: input.error.flatten() }, { status: 400 });
  try { return NextResponse.json(await saveSearchConfiguration(input.data.dictionary, input.data.expectedRevision, user.id)); }
  catch (error) { const conflict = error instanceof Error && error.message === "REVISION_CONFLICT"; return NextResponse.json({ code: conflict ? "REVISION_CONFLICT" : "SEARCH_CONFIGURATION_UNAVAILABLE" }, { status: conflict ? 409 : 503 }); }
}
