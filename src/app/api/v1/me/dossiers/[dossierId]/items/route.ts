import { assertStorageQuota } from "@/platform/storage/quota";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDocuments, personalDossierItems, personalDossiers } from "@/platform/database/schema";
import { encryptDossierData } from "@/modules/documents/crypto";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { createDossierItemSchema } from "@/modules/dossiers/schema";

export async function POST(request: Request, { params }: { params: Promise<{ dossierId: string }> }) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  const parsed = createDossierItemSchema.safeParse(await readJsonBody(request, 12 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Enter a checklist item label.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const { dossierId } = await params;
  const [dossier] = await db.select({ id: personalDossiers.id }).from(personalDossiers).where(and(
    eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"),
  )).limit(1);
  if (!dossier) return NextResponse.json({ code: "NOT_FOUND", message: "Dossier not found." }, { status: 404 });
  if (parsed.data.documentId) {
    const [document] = await db.select({ id: personalDocuments.id }).from(personalDocuments).where(and(
      eq(personalDocuments.id, parsed.data.documentId), eq(personalDocuments.ownerUserId, user.id), eq(personalDocuments.status, "draft"),
    )).limit(1);
    if (!document) return NextResponse.json({ code: "DOCUMENT_NOT_FOUND", message: "The selected document is not available in your account." }, { status: 404 });
  }
  const id = randomUUID();
  try {
    const encrypted = encryptDossierData(parsed.data.label, user.id, id);
    await db.transaction(async tx => {
      await assertStorageQuota(tx, user.id, Buffer.byteLength(encrypted.ciphertext));
      const [live] = await tx.select({ id: personalDossiers.id }).from(personalDossiers).where(and(eq(personalDossiers.id, dossierId), eq(personalDossiers.ownerUserId, user.id), eq(personalDossiers.status, "open"))).for("update").limit(1);
      if (!live) throw new Error("DOSSIER_UNAVAILABLE");
      await tx.insert(personalDossierItems).values({
      id, dossierId, linkedDocumentId: parsed.data.documentId ?? null, kind: parsed.data.documentId ? "document" : "checklist",
      status: parsed.data.documentId ? "added" : "missing", required: parsed.data.required ? 1 : 0,
      labelCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion,
      });
    });
    return NextResponse.json({ id, dossierId, label: parsed.data.label, status: parsed.data.documentId ? "added" : "missing" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED") return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED" }, { status: 413 });
    return NextResponse.json({ code: "DOSSIER_UNAVAILABLE", message: "The checklist item could not be saved." }, { status: 503 });
  }
}
