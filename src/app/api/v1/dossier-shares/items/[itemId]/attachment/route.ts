import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { dossierShareAccessSchema } from "@/modules/dossiers/policy";
import { readDossierSharedAttachment } from "@/modules/dossiers/sharing";
import { dossierFailure, dossierPrivateHeaders } from "@/modules/dossiers/http";
export async function POST(request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = dossierShareAccessSchema.safeParse(await readJsonBody(request, 1024)); if (!input.success) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404 });
  try { const file = await readDossierSharedAttachment(user.id, input.data.token, (await params).itemId); return new NextResponse(new Uint8Array(file.data), { headers: { ...dossierPrivateHeaders, "Content-Type": file.mimeType, "Content-Disposition": `attachment; filename="tndocs-piece.${file.mimeType === "application/pdf" ? "pdf" : file.mimeType === "image/png" ? "png" : "jpg"}"`, "Content-Security-Policy": "sandbox" } }); }
  catch (error) { return dossierFailure(error); }
}
