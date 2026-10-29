import { NextResponse } from "next/server";
import { getPublicTemplates } from "@/modules/catalog/public";
import { publicSearchRequest } from "@/modules/search/request";
export async function GET(request: Request) {
  const input = publicSearchRequest(new URL(request.url));
  if (!input.success) return NextResponse.json({ code: "INVALID_SEARCH" }, { status: 400 });
  if (!input.data.q || input.data.q.length < 2) return NextResponse.json({ suggestions: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const rows = await getPublicTemplates(input.data.locale, { query: input.data.q, category: input.data.category, documentType: input.data.documentType, organizationId: input.data.organizationId, limit: 8, recordMetrics: false });
    return NextResponse.json({ suggestions: rows.map(({ id, title, contentLocale, translationMissing }) => ({ id, title, contentLocale, translationMissing })) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ suggestions: [], degraded: true }, { headers: { "Cache-Control": "no-store" } }); }
}
