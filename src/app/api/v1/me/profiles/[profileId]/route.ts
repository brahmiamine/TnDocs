import { assertStorageQuota, lockStorageOwner } from "@/platform/storage/quota";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personProfiles } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody } from "@/modules/identity/http";
import { encryptProfileData } from "@/modules/profiles/crypto";
import { profileInputSchema } from "@/modules/profiles/schema";

type RouteContext = { params: Promise<{ profileId: string }> };

function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ code: "INVALID_ORIGIN", message: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Profile service is not configured." }, { status: 503 });
  const { profileId } = await params;
  const [existing] = await database.select().from(personProfiles).where(and(
    eq(personProfiles.id, profileId), eq(personProfiles.ownerUserId, user.id),
  )).limit(1);
  if (!existing) return NextResponse.json({ code: "NOT_FOUND", message: "Profile not found." }, { status: 404 });

  const parsed = profileInputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Check the profile fields and authorization confirmation.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });
  if (parsed.data.relationship === "self" && existing.relationship !== "self") {
    const [primary] = await database.select({ id: personProfiles.id }).from(personProfiles).where(and(
      eq(personProfiles.ownerUserId, user.id), eq(personProfiles.relationship, "self"), ne(personProfiles.id, profileId),
    )).limit(1);
    if (primary) return NextResponse.json({ code: "PRIMARY_PROFILE_EXISTS", message: "A primary profile already exists." }, { status: 409 });
  }
  let encrypted;
  try { encrypted = encryptProfileData(parsed.data.data, user.id, profileId); }
  catch { return NextResponse.json({ code: "ENCRYPTION_UNAVAILABLE", message: "Profile encryption is not configured." }, { status: 503 }); }
  const basis = parsed.data.relationship === "self" ? "self" : parsed.data.authorizationBasis!;
  try {
    await database.transaction(async (tx) => {
      await lockStorageOwner(tx, user.id);
      const [current] = await tx.select().from(personProfiles).where(and(eq(personProfiles.id, profileId), eq(personProfiles.ownerUserId, user.id))).for("update").limit(1);
      if (!current) throw new Error("PROFILE_NOT_FOUND");
      await assertStorageQuota(tx, user.id, Buffer.byteLength(encrypted.ciphertext), Buffer.byteLength(current.dataCiphertext));
      if (parsed.data.relationship === "self") {
        const [primary] = await tx.select({ id: personProfiles.id }).from(personProfiles).where(and(eq(personProfiles.ownerUserId, user.id), eq(personProfiles.relationship, "self"), ne(personProfiles.id, profileId))).limit(1);
        if (primary) throw new Error("PRIMARY_PROFILE_EXISTS");
      }
      await tx.update(personProfiles).set({ relationship: parsed.data.relationship, authorizationBasis: basis, authorizationConfirmedAt: new Date(), dataCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion }).where(and(eq(personProfiles.id, profileId), eq(personProfiles.ownerUserId, user.id)));
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROFILE_UNAVAILABLE";
    return NextResponse.json({ code: ["STORAGE_QUOTA_EXCEEDED", "PROFILE_NOT_FOUND", "PRIMARY_PROFILE_EXISTS"].includes(code) ? code : "PROFILE_UNAVAILABLE" }, { status: code === "STORAGE_QUOTA_EXCEEDED" ? 413 : code === "PROFILE_NOT_FOUND" ? 404 : code === "PRIMARY_PROFILE_EXISTS" ? 409 : 503 });
  }
  return NextResponse.json({ id: profileId, relationship: parsed.data.relationship, data: parsed.data.data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!sameOrigin(request)) return NextResponse.json({ code: "INVALID_ORIGIN", message: "Request origin is not allowed." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Profile service is not configured." }, { status: 503 });
  const { profileId } = await params;
  const deleted = await database.delete(personProfiles).where(and(
    eq(personProfiles.id, profileId), eq(personProfiles.ownerUserId, user.id),
  ));
  if (!deleted[0].affectedRows) return NextResponse.json({ code: "NOT_FOUND", message: "Profile not found." }, { status: 404 });
  return NextResponse.json({ status: "deleted" }, { headers: { "Cache-Control": "no-store" } });
}
