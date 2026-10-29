import { assertStorageQuota } from "@/platform/storage/quota";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personalDossiers, personalDossierItems } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { decryptDossierData, encryptDossierData } from "@/modules/documents/crypto";
import { createDossierSchema } from "@/modules/dossiers/schema";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  try {
    const includeTrash = new URL(request.url).searchParams.get("includeTrash") === "true";
    const rows = await database.select().from(personalDossiers).where(and(
      eq(personalDossiers.ownerUserId, user.id), includeTrash ? eq(personalDossiers.status, "trash") : ne(personalDossiers.status, "trash"),
    )).orderBy(desc(personalDossiers.updatedAt)).limit(100);
    const itemRows = rows.length ? await database.select({ dossierId: personalDossierItems.dossierId }).from(personalDossierItems)
      .where(inArray(personalDossierItems.dossierId, rows.map(({ id }) => id))) : [];
    const counts = new Map<string, number>();
    for (const item of itemRows) counts.set(item.dossierId, (counts.get(item.dossierId) ?? 0) + 1);
    const dossiers = rows.map((row) => ({
        id: row.id,
        title: decryptDossierData<string>(row.titleCiphertext, row.encryptionKeyVersion, user.id, row.id),
        status: row.status, itemCount: counts.get(row.id) ?? 0, createdAt: row.createdAt, updatedAt: row.updatedAt,
      }));
    return NextResponse.json({ dossiers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "DOSSIER_UNAVAILABLE", message: "Dossiers are temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Dossier service is not configured." }, { status: 503 });
  const parsed = createDossierSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Enter a dossier name.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  const id = randomUUID();
  try {
    const encrypted = encryptDossierData(parsed.data.title, user.id, id);
    await db.transaction(async tx => {
      await assertStorageQuota(tx, user.id, Buffer.byteLength(encrypted.ciphertext));
      await tx.insert(personalDossiers).values({ id, ownerUserId: user.id, titleCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion });
    });
    return NextResponse.json({ id, title: parsed.data.title, status: "open" }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED") return NextResponse.json({ code: "STORAGE_QUOTA_EXCEEDED" }, { status: 413 });
    return NextResponse.json({ code: "DOSSIER_UNAVAILABLE", message: "The dossier could not be created." }, { status: 503 });
  }
}
