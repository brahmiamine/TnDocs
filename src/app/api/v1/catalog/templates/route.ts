import { NextResponse } from "next/server";
import { getPublicTemplates } from "@/modules/catalog/public";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const localeValue = url.searchParams.get("locale") ?? "fr";
  const query = url.searchParams.get("q")?.trim();
  const category = url.searchParams.get("category")?.trim();
  if (localeValue !== "fr" && localeValue !== "ar") return NextResponse.json({ code: "INVALID_LOCALE", message: "Locale must be fr or ar." }, { status: 400 });
  if (query && query.length > 120) return NextResponse.json({ code: "INVALID_QUERY", message: "Search query is too long." }, { status: 400 });
  if (category && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) return NextResponse.json({ code: "INVALID_CATEGORY", message: "Category slug is invalid." }, { status: 400 });
  const templates = await getPublicTemplates(localeValue, { query, category, limit: 50 });
  return NextResponse.json({ templates }, { headers: { "Cache-Control": "no-store" } });
}
