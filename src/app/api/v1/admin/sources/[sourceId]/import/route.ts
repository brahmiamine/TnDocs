import { NextResponse } from "next/server";
import { userHasRole } from "@/modules/identity/authorization";
import { requireSameOrigin } from "@/modules/identity/http";
import { ingestSourceOriginal, readSourceUpload } from "@/modules/sources/ingestion";
export async function POST(request: Request, { params }: { params: Promise<{ sourceId: string }> }) {
  const error = requireSameOrigin(request); if (error) return error;
  const { user, reason } = await userHasRole("admin"); if (!user) return NextResponse.json({ code: reason }, { status: reason === "unauthenticated" ? 401 : 403 });
  try { const { sourceId } = await params; return NextResponse.json(await ingestSourceOriginal(sourceId, await readSourceUpload(request)), { status: 201, headers: { "Cache-Control": "no-store" } }); }
  catch (error) { const code = error instanceof Error && /^SOURCE_[A-Z_]+$/.test(error.message) ? error.message : "SOURCE_IMPORT_UNAVAILABLE"; return NextResponse.json({ code }, { status: code === "SOURCE_TOO_LARGE" ? 413 : code === "SOURCE_IMPORT_UNAVAILABLE" ? 503 : 400 }); }
}
