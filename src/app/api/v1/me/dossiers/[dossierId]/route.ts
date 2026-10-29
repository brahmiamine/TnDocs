import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDossierItems, personalDossiers } from "@/platform/database/schema";
import { decryptDossierData } from "@/modules/documents/crypto";
import { getCurrentUser } from "@/modules/identity/service";
import { requireSameOrigin } from "@/modules/identity/http";

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
    return NextResponse.json({ dossier: { id: dossier.id, title: decryptDossierData<string>(dossier.titleCiphertext, dossier.encryptionKeyVersion, user.id, dossier.id), items } }, { headers: { "Cache-Control": "private, no-store" } });
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
  const result = await database.update(personalDossiers).set({ status: "trash" }).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id),
  ));
  if (!result[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Dossier not found." }, { status: 404 });
  return NextResponse.json({ id: dossierId, status: "trash" }, { headers: { "Cache-Control": "private, no-store" } });
}
