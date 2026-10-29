import { NextResponse } from "next/server";
import { getPublicTemplate } from "@/modules/catalog/public";

export async function GET(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const url = new URL(request.url);
  const localeValue = url.searchParams.get("locale") ?? "fr";
  if (localeValue !== "fr" && localeValue !== "ar") return NextResponse.json({ code: "INVALID_LOCALE", message: "Locale must be fr or ar." }, { status: 400 });
  const { templateId } = await params;
  const template = await getPublicTemplate(templateId, localeValue);
  if (!template) return NextResponse.json({ code: "NOT_FOUND", message: "Published template not found." }, { status: 404 });
  return NextResponse.json({ template }, { headers: { "Cache-Control": "no-store" } });
}
