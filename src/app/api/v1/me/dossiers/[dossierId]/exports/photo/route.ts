import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDossiers } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { detectAllowedMimeType, scanWithClamAv } from "@/modules/dossiers/clamav";
import { photoToPdf } from "@/modules/dossiers/export";

export const runtime = "nodejs";
const maxBytes = 10 * 1024 * 1024;
export async function POST(request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const { dossierId } = await params;
  const [dossier] = await database.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes + 65536) return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 });
  try {
    if (!request.body) return NextResponse.json({ code: "INVALID_UPLOAD" }, { status: 400 });
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes + 65536) { await reader.cancel(); return NextResponse.json({ code: "FILE_TOO_LARGE" }, { status: 413 }); }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size < 1 || file.size > maxBytes) return NextResponse.json({ code: "INVALID_UPLOAD" }, { status: 400 });
    const data = Buffer.from(await file.arrayBuffer()); const mimeType = detectAllowedMimeType(data);
    if ((mimeType !== "image/png" && mimeType !== "image/jpeg") || mimeType !== file.type) return NextResponse.json({ code: "IMAGE_TYPE" }, { status: 415 });
    let scan: "clean" | "infected";
    try { scan = await scanWithClamAv(data); } catch { return NextResponse.json({ code: "ANTIVIRUS_UNAVAILABLE" }, { status: 503 }); }
    if (scan !== "clean") return NextResponse.json({ code: "UNSAFE_FILE" }, { status: 422 });
    const pdf = await photoToPdf({ data, mimeType });
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="scan.pdf"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return NextResponse.json({ code: "PHOTO_CONVERSION_UNAVAILABLE" }, { status: 422, headers: { "Cache-Control": "no-store" } }); }
}
