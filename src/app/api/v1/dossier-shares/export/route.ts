import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { dossierShareAccessSchema } from "@/modules/dossiers/policy";
import { exportDossierShare } from "@/modules/dossiers/sharing";
import { dossierFailure, dossierPrivateHeaders } from "@/modules/dossiers/http";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = dossierShareAccessSchema.safeParse(await readJsonBody(request, 1024)); if (!input.success) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404 });
  try { const output = await exportDossierShare(user.id, input.data.token); return new NextResponse(new Uint8Array(output), { headers: { ...dossierPrivateHeaders, "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="tndocs-dossier-partage.zip"' } }); }
  catch (error) { return dossierFailure(error); }
}
