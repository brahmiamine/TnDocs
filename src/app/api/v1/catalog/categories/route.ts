import { NextResponse } from "next/server";
import { getPublicCategories } from "@/modules/catalog/public";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const localeValue = url.searchParams.get("locale") ?? "fr";
  if (localeValue !== "fr" && localeValue !== "ar") return NextResponse.json({ code: "INVALID_LOCALE", message: "Locale must be fr or ar." }, { status: 400 });
  const categories = await getPublicCategories(localeValue);
  return NextResponse.json({ categories }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}
