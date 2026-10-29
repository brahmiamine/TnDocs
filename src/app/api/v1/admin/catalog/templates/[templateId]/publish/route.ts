import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogTemplateCategories, catalogTemplateSources, catalogTemplateTranslations, catalogTemplateVersions, catalogTemplates } from "@/platform/database/schema";
import { requireSameOrigin } from "@/modules/identity/http";
import { userHasRole } from "@/modules/identity/authorization";
import { parseFormSchema } from "@/modules/documents/form-schema";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user, reason } = await userHasRole("admin");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "Administrator access is required." }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Catalog service is not configured." }, { status: 503 });
  const { templateId } = await params;
  const [template] = await database.select().from(catalogTemplates).where(eq(catalogTemplates.id, templateId)).limit(1);
  if (!template) return NextResponse.json({ code: "NOT_FOUND", message: "Template not found." }, { status: 404 });
  const [version] = await database.select().from(catalogTemplateVersions).where(eq(catalogTemplateVersions.templateId, templateId)).orderBy(desc(catalogTemplateVersions.version)).limit(1);
  if (!version || !["in_review", "published"].includes(version.status) || template.status === "archived") {
    return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "Submit the current draft for review before publication." }, { status: 409 });
  }

  const translations = await database.select().from(catalogTemplateTranslations).where(eq(catalogTemplateTranslations.versionId, version.id));
  if (translations.length === 0 || translations.some((translation) => !translation.title.trim() || !translation.summary.trim())) {
    return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "A reviewed translation with a title and summary is required." }, { status: 409 });
  }
  const categories = await database.select().from(catalogTemplateCategories).where(eq(catalogTemplateCategories.versionId, version.id));
  if (categories.length === 0) return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "At least one catalog category is required." }, { status: 409 });
  if (template.documentType !== "official" && !version.documentContent) {
    return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "Document content is required for this template type." }, { status: 409 });
  }
  if (version.formSchema && !parseFormSchema(version.formSchema)) {
    return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "The form schema contains unsupported fields or rules." }, { status: 409 });
  }

  const sources = await database.select().from(catalogTemplateSources).where(eq(catalogTemplateSources.versionId, version.id));
  const verifiedOfficial = sources.some((source) => source.official === 1 && source.checkedAt !== null && source.reusePermission !== "pending" && source.reusePermission !== "forbidden");
  if (!verifiedOfficial || sources.some((source) => source.reusePermission === "pending" || source.reusePermission === "forbidden")) {
    return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "At least one reviewed official source is required; unresolved or forbidden reuse permissions block publication." }, { status: 409 });
  }
  if (template.documentType === "editable" && !sources.some((source) => source.reusePermission === "allowed")) {
    return NextResponse.json({ code: "PUBLISH_BLOCKED", message: "An editable template requires a source whose reuse permission is confirmed." }, { status: 409 });
  }

  const changed = await database.transaction(async (tx) => {
    const result = await tx.update(catalogTemplates).set({ status: "published", publishedVersionId: version.id, publishedAt: new Date() }).where(and(
      eq(catalogTemplates.id, templateId), eq(catalogTemplates.status, template.status),
    ));
    if (!result[0].affectedRows) return false;
    await tx.update(catalogTemplateVersions).set({ status: "published" }).where(eq(catalogTemplateVersions.id, version.id));
    return true;
  });
  if (!changed) return NextResponse.json({ code: "INVALID_STATE", message: "The template changed while publication was being processed." }, { status: 409 });
  return NextResponse.json({ id: templateId, versionId: version.id, status: "published" }, { headers: { "Cache-Control": "no-store" } });
}
