import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogTemplateVersions, catalogTemplates } from "@/platform/database/schema";
import { requireSameOrigin } from "@/modules/identity/http";
import { userHasRole } from "@/modules/identity/authorization";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user, reason } = await userHasRole("moderator");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "Moderator access is required." }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Catalog service is not configured." }, { status: 503 });
  const { templateId } = await params;
  const [template] = await database.select().from(catalogTemplates).where(eq(catalogTemplates.id, templateId)).limit(1);
  if (!template || template.status === "archived") return NextResponse.json({ code: "NOT_FOUND", message: "Editable template not found." }, { status: 404 });
  const [version] = await database.select().from(catalogTemplateVersions).where(eq(catalogTemplateVersions.templateId, templateId)).orderBy(desc(catalogTemplateVersions.version)).limit(1);
  if (!version || version.status !== "draft") return NextResponse.json({ code: "INVALID_STATE", message: "Only a draft version can be submitted for review." }, { status: 409 });
  await database.transaction(async (tx) => {
    await tx.update(catalogTemplateVersions).set({ status: "in_review" }).where(and(eq(catalogTemplateVersions.id, version.id), eq(catalogTemplateVersions.status, "draft")));
    if (template.status === "draft") await tx.update(catalogTemplates).set({ status: "in_review" }).where(eq(catalogTemplates.id, templateId));
  });
  return NextResponse.json({ templateId, versionId: version.id, status: "in_review" }, { headers: { "Cache-Control": "no-store" } });
}
