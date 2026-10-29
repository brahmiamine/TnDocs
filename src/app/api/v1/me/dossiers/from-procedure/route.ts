import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { procedureDossierSchema } from "@/modules/dossiers/policy";
import { createDossierFromProcedure } from "@/modules/dossiers/procedures";
import { dossierFailure, dossierPrivateHeaders } from "@/modules/dossiers/http";
export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const input = procedureDossierSchema.safeParse(await readJsonBody(request, 4096));
  if (!input.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  try { return NextResponse.json(await createDossierFromProcedure(user.id, input.data), { status: 201, headers: dossierPrivateHeaders }); }
  catch (error) { return dossierFailure(error); }
}
