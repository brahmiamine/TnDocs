import { createHash, randomUUID } from "node:crypto";
import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { registeredSources } from "@/modules/sources/db-schema";
import { approvedSourceHosts, validateSourceUrl } from "@/modules/sources/network-policy";
const schema = z.object({ name: z.string().trim().min(2).max(180), url: z.string().url().max(2048), reusePermission: z.enum(["pending", "allowed", "no_reproduction", "forbidden"]), approved: z.boolean(), frequencyDays: z.number().int().min(1).max(365).default(7) }).strict();
export async function GET() {
  const { user, reason } = await userHasRole("moderator"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ hosts: approvedSourceHosts(), sources: await database.select().from(registeredSources).orderBy(desc(registeredSources.createdAt)).limit(200) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const input = schema.safeParse(await readJsonBody(request)); if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  try {
    const url = validateSourceUrl(input.data.url).toString(), id = randomUUID();
    await database.insert(registeredSources).values({ id, name: input.data.name, url, canonicalUrlHash: createHash("sha256").update(url).digest("hex"), reusePermission: input.data.reusePermission, approved: input.data.approved ? 1 : 0, frequencyDays: input.data.frequencyDays, createdBy: user.id });
    return NextResponse.json({ id }, { status: 201 });
  } catch { return NextResponse.json({ code: "SOURCE_URL_NOT_ALLOWED_OR_EXISTS" }, { status: 400 }); }
}
