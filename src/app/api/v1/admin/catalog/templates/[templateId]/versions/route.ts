import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { catalogDraftSchema } from "@/modules/catalog/admin-schema";
import { addCatalogDraftVersion } from "@/modules/catalog/admin";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { userHasRole } from "@/modules/identity/authorization";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user, reason } = await userHasRole("moderator");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "You are not allowed to edit catalog drafts." }, { status: reason === "unauthenticated" ? 401 : 403 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Catalog service is not configured." }, { status: 503 });
  const parsed = catalogDraftSchema.safeParse(await readJsonBody(request, 512 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Check the draft fields and at least one translation.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { templateId } = await params;
  try {
    const version = await addCatalogDraftVersion(templateId, parsed.data, user.id);
    return NextResponse.json(version, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "UNKNOWN_ORGANIZATION") return NextResponse.json({code:"UNKNOWN_ORGANIZATION",message:"The selected organization is missing or inactive."},{status:400});
    if (error instanceof Error && error.message === "UNKNOWN_CATEGORY") return NextResponse.json({ code: "UNKNOWN_CATEGORY", message: "One or more categories are missing or inactive." }, { status: 400 });
    if (error instanceof Error && error.message === "TEMPLATE_NOT_EDITABLE") return NextResponse.json({ code: "NOT_FOUND", message: "Editable template not found." }, { status: 404 });
    return NextResponse.json({ code: "CATALOG_UNAVAILABLE", message: "The version could not be saved." }, { status: 503 });
  }
}
