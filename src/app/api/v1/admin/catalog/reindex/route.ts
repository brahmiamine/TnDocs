import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/modules/identity/http";
import { userHasRole } from "@/modules/identity/authorization";
import { rebuildPublishedTemplateIndex } from "@/modules/catalog/search-index";

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const { user, reason } = await userHasRole("admin");
  if (!user) return NextResponse.json({ code: reason === "unauthenticated" ? "UNAUTHENTICATED" : "FORBIDDEN", message: "Administrator access is required." }, { status: reason === "unauthenticated" ? 401 : 403 });
  try {
    const result = await rebuildPublishedTemplateIndex();
    if (!result.configured) return NextResponse.json({ code: "SEARCH_UNAVAILABLE", message: "Meilisearch is not configured." }, { status: 503 });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ code: "REINDEX_FAILED", message: "The search index could not be rebuilt." }, { status: 503 });
  }
}
