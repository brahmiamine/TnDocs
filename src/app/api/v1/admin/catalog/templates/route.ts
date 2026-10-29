import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { database } from "@/platform/database/client";
import { catalogTemplateTranslations, catalogTemplateVersions, catalogTemplates } from "@/platform/database/schema";
import { catalogDraftSchema } from "@/modules/catalog/admin-schema";
import { createCatalogDraft } from "@/modules/catalog/admin";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { userHasRole } from "@/modules/identity/authorization";

export async function GET() {
  const { user, reason } = await userHasRole("moderator");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "Moderator access is required." }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Catalog service is not configured." }, { status: 503 });
  const db = database;
  const templates = await db.select().from(catalogTemplates).orderBy(desc(catalogTemplates.updatedAt)).limit(100);
  const rows = await Promise.all(templates.map(async (template) => {
    const [version] = await db.select().from(catalogTemplateVersions)
      .where(eq(catalogTemplateVersions.templateId, template.id)).orderBy(desc(catalogTemplateVersions.version)).limit(1);
    const translations = version ? await db.select().from(catalogTemplateTranslations)
      .where(eq(catalogTemplateTranslations.versionId, version.id)) : [];
    return { ...template, latestVersion: version ?? null, translations };
  }));
  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user, reason } = await userHasRole("moderator");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "You are not allowed to create catalog drafts." }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Catalog service is not configured." }, { status: 503 });
  const parsed = catalogDraftSchema.safeParse(await readJsonBody(request, 512 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Check the draft fields and at least one translation.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  try {
    const draft = await createCatalogDraft(parsed.data, user.id);
    return NextResponse.json(draft, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNKNOWN_CATEGORY") {
      return NextResponse.json({ code: "UNKNOWN_CATEGORY", message: "One or more category slugs do not exist." }, { status: 400 });
    }
    return NextResponse.json({ code: "CATALOG_UNAVAILABLE", message: "The draft could not be saved." }, { status: 503 });
  }
}
