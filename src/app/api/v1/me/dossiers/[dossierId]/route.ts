import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers } from "@/platform/database/schema";
import { getDossierProcedure } from "@/modules/dossiers/procedures";
import { decryptDossierData } from "@/modules/documents/crypto";
import { getCurrentUser } from "@/modules/identity/service";
import { trashOwnedResource, restoreOwnedResource } from "@/platform/retention/trash";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";

export async function GET(_request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  const { dossierId } = await params;
  const [dossier] = await db.select().from(personalDossiers).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"),
  )).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND", message: "Dossier not found." }, { status: 404 });
  try {
    const rows = await db.select().from(personalDossierItems).where(eq(personalDossierItems.dossierId, dossierId)).orderBy(personalDossierItems.createdAt);
    const items = rows.map((row) => ({
      id: row.id, linkedDocumentId: row.linkedDocumentId, storedFileId: row.storedFileId, kind: row.kind, status: row.status, required: row.required === 1,
      label: decryptDossierData<string>(row.labelCiphertext, row.encryptionKeyVersion, user.id, row.id), createdAt: row.createdAt,
    }));
    return NextResponse.json({ dossier: { procedure: await getDossierProcedure(dossierId), id: dossier.id, title: decryptDossierData<string>(dossier.titleCiphertext, dossier.encryptionKeyVersion, user.id, dossier.id), items } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "DOSSIER_UNAVAILABLE", message: "Dossier details are temporarily unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  const { dossierId } = await params;
  if (!await trashOwnedResource("dossier", dossierId, user.id)) return NextResponse.json({ code: "NOT_FOUND", message: "Dossier not found." }, { status: 404 });
  return NextResponse.json({ id: dossierId, status: "trash" }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const input = await readJsonBody(request, 2048);
  if (!input || typeof input !== "object" || !("action" in input) || input.action !== "restore") return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const { dossierId } = await params;
  const restored = await restoreOwnedResource("dossier", dossierId, user.id);
  if (restored === "expired") return NextResponse.json({ code: "TRASH_RETENTION_EXPIRED" }, { status: 410 });
  if (restored !== "restored") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ id: dossierId, status: "open" }, { headers: { "Cache-Control": "private, no-store" } });
}
