import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { database } from "@/platform/database/client";
import { personalDocumentFolders } from "@/platform/database/schema";
import { decryptOwnerPrivateData, encryptOwnerPrivateData } from "@/modules/documents/crypto";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const folders = await database.select().from(personalDocumentFolders).where(eq(personalDocumentFolders.ownerUserId, user.id)).orderBy(desc(personalDocumentFolders.updatedAt)).limit(100);
  try {
    return NextResponse.json({ folders: folders.map((folder) => ({ id: folder.id, name: decryptOwnerPrivateData<{ name: string }>(folder.nameCiphertext, folder.encryptionKeyVersion, user.id, folder.id).name, updatedAt: folder.updatedAt })) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "FOLDERS_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const originError = requireSameOrigin(request);
  if (originError) return originError;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(await readJsonBody(request, 2 * 1024));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT" }, { status: 400 });
  const existing = await database.select({ id: personalDocumentFolders.id }).from(personalDocumentFolders).where(eq(personalDocumentFolders.ownerUserId, user.id)).limit(100);
  if (existing.length >= 100) return NextResponse.json({ code: "FOLDER_LIMIT_REACHED" }, { status: 409 });
  const folderId = randomUUID();
  try {
    const encrypted = encryptOwnerPrivateData({ name: parsed.data.name }, user.id, folderId);
    await database.insert(personalDocumentFolders).values({ id: folderId, ownerUserId: user.id, nameCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion });
    return NextResponse.json({ folder: { id: folderId, name: parsed.data.name } }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "FOLDER_UNAVAILABLE" }, { status: 503 });
  }
}
