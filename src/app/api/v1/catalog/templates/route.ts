import { NextResponse } from "next/server";
import { getPublicTemplatePage } from "@/modules/catalog/public";
import { publicSearchRequest } from "@/modules/search/request";
export async function GET(request: Request) {
  const input = publicSearchRequest(new URL(request.url));
  if (!input.success) return NextResponse.json({ code: "INVALID_SEARCH", fields: input.error.flatten().fieldErrors }, { status: 400 });
  const { locale, q, mode, ...options } = input.data;
  try { return NextResponse.json(await getPublicTemplatePage(locale, { ...options, query: q, forceDatabaseSearch: mode === "simple" }), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ code: "SEARCH_UNAVAILABLE" }, { status: 503 }); }
}
