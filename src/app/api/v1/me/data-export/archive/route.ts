import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { strToU8, zipSync } from "fflate";
import { database } from "@/platform/database/client";
import { storedFiles } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { buildAccountDataExport } from "@/modules/privacy/account-export";
import { decryptAttachment } from "@/modules/dossiers/file-crypto";
import { readEncryptedAttachment } from "@/modules/dossiers/file-storage";

const MAX_EXPORT_BYTES = 100 * 1024 * 1024;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 });
  try {
    const [account, files] = await Promise.all([
      buildAccountDataExport(user),
      database.select().from(storedFiles).where(eq(storedFiles.ownerUserId, user.id)),
    ]);
    const archive: Record<string, Uint8Array> = { "account.json": strToU8(JSON.stringify(account, null, 2)) };
    const fileIndex: Array<Record<string, unknown>> = [];
    let totalBytes = 0;
    for (const file of files) {
      if (file.scanStatus !== "clean") throw new Error("Attachment has not passed malware scanning");
      totalBytes += file.byteSize;
      if (totalBytes > MAX_EXPORT_BYTES) return NextResponse.json({ code: "EXPORT_TOO_LARGE" }, { status: 413 });
      const ciphertext = await readEncryptedAttachment(file.storageKey);
      const data = decryptAttachment(ciphertext, file.encryptionKeyVersion, user.id, file.id);
      if (data.byteLength !== file.byteSize || createHash("sha256").update(data).digest("hex") !== file.sha256) {
        throw new Error("Attachment integrity check failed");
      }
      const extension = file.mimeType === "application/pdf" ? "pdf" : file.mimeType === "image/png" ? "png" : "jpg";
      const path = `files/${file.dossierId}/${file.id}.${extension}`;
      archive[path] = data;
      fileIndex.push({ id: file.id, dossierId: file.dossierId, mimeType: file.mimeType, byteSize: file.byteSize, path });
    }
    archive["files/index.json"] = strToU8(JSON.stringify(fileIndex, null, 2));
    const zip = zipSync(archive, { level: 1 });
    return new NextResponse(new Uint8Array(zip), { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="tndocs-full-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Content-Length": String(zip.byteLength), "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    } });
  } catch {
    return NextResponse.json({ code: "EXPORT_UNAVAILABLE", message: "The account archive could not be prepared." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
