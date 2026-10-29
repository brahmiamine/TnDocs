import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogTemplates } from "@/platform/database/schema";
import { requireSameOrigin } from "@/modules/identity/http";
import { userHasRole } from "@/modules/identity/authorization";
import { removeTemplateFromSearch } from "@/modules/catalog/search-index";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user, reason } = await userHasRole("admin");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "Administrator access is required." }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Catalog service is not configured." }, { status: 503 });
  const { templateId } = await params;
  const updated = await database.update(catalogTemplates).set({ status: "archived", publishedVersionId: null, publishedAt: null }).where(and(
    eq(catalogTemplates.id, templateId), eq(catalogTemplates.status, "published"),
  ));
  if (!updated[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Published template not found." }, { status: 404 });
  let searchIndexSynced = false;
  try { searchIndexSynced = await removeTemplateFromSearch(templateId); } catch { searchIndexSynced = false; }
  return NextResponse.json({ id: templateId, status: "archived", searchIndexSynced }, { headers: { "Cache-Control": "no-store" } });
}
