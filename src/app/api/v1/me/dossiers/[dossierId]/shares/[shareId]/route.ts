import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";
import { revokeDossierShare } from "@/modules/dossiers/sharing";
import { dossierFailure, dossierPrivateHeaders } from "@/modules/dossiers/http";
export async function DELETE(request: Request, { params }: { params: Promise<{ dossierId: string; shareId: string }> }) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try { const { dossierId, shareId } = await params; await revokeDossierShare(user.id, dossierId, shareId); return NextResponse.json({ revoked: true }, { headers: dossierPrivateHeaders }); }
  catch (error) { return dossierFailure(error); }
}
