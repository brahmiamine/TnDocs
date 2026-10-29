import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { dossierShareAccessSchema } from "@/modules/dossiers/policy";
import { accessDossierShare } from "@/modules/dossiers/sharing";
import { dossierFailure, dossierPrivateHeaders } from "@/modules/dossiers/http";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers: dossierPrivateHeaders });
  const input = dossierShareAccessSchema.safeParse(await readJsonBody(request, 1024)); if (!input.success) return NextResponse.json({ code: "SHARE_UNAVAILABLE" }, { status: 404 });
  try { return NextResponse.json(await accessDossierShare(user.id, input.data.token), { headers: dossierPrivateHeaders }); }
  catch (error) { return dossierFailure(error); }
}
