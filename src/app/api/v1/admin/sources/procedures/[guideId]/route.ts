import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { userHasRole } from "@/modules/identity/authorization";
import { requireSameOrigin } from "@/modules/identity/http";
import { procedureGuides } from "@/modules/procedures/db-schema";
export async function DELETE(request: Request, { params }: { params: Promise<{ guideId: string }> }) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { guideId } = await params;
  const result = await database.update(procedureGuides).set({ publishedVersion: null }).where(eq(procedureGuides.id, guideId));
  return NextResponse.json(result[0].affectedRows ? { status: "unpublished" } : { code: "NOT_FOUND" }, { status: result[0].affectedRows ? 200 : 404 });
}
