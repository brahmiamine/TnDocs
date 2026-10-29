import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { createDossierShareSchema } from "@/modules/dossiers/policy";
import { createDossierShare, listDossierShares } from "@/modules/dossiers/sharing";
import { dossierFailure, dossierPrivateHeaders } from "@/modules/dossiers/http";
import { env } from "@/platform/config/env";
type Context = { params: Promise<{ dossierId: string }> };
export async function GET(_request: Request, { params }: Context) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try { return NextResponse.json({ shares: await listDossierShares(user.id, (await params).dossierId) }, { headers: dossierPrivateHeaders }); }
  catch (error) { return dossierFailure(error); }
}
export async function POST(request: Request, { params }: Context) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = createDossierShareSchema.safeParse(await readJsonBody(request, 4096));
  if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  try {
    const { token, ...share } = await createDossierShare(user.id, (await params).dossierId, input.data);
    return NextResponse.json({ share, url: new URL(`/${input.data.locale}/dossier-partage#${token}`, env.APP_URL).toString() }, { status: 201, headers: dossierPrivateHeaders });
  } catch (error) { return dossierFailure(error); }
}
