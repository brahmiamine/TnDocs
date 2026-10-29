import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { database } from "@/platform/database/client";
import { personProfiles } from "@/platform/database/schema";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody } from "@/modules/identity/http";
import { encryptProfileData, decryptProfileData } from "@/modules/profiles/crypto";
import { profileInputSchema, type ProfileData } from "@/modules/profiles/schema";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  if (!database) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Profile service is not configured." }, { status: 503 });

  try {
    const rows = await database.select().from(personProfiles).where(eq(personProfiles.ownerUserId, user.id)).orderBy(asc(personProfiles.createdAt));
    const profiles = rows.map(({ dataCiphertext, encryptionKeyVersion, ownerUserId, id, ...profile }) => ({
      ...profile,
      id,
      data: decryptProfileData<ProfileData>(dataCiphertext, encryptionKeyVersion, ownerUserId, id),
    }));
    return NextResponse.json({ profiles }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "PROFILE_UNAVAILABLE", message: "Profile data is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(process.env.APP_URL ?? "http://localhost:3000").origin) {
    return NextResponse.json({ code: "INVALID_ORIGIN", message: "Request origin is not allowed." }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  const db = database;
  if (!db) return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Profile service is not configured." }, { status: 503 });
  const parsed = profileInputSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ code: "INVALID_INPUT", message: "Check the profile fields and authorization confirmation.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  if (parsed.data.relationship === "self") {
    const [existing] = await db.select({ id: personProfiles.id }).from(personProfiles).where(and(
      eq(personProfiles.ownerUserId, user.id), eq(personProfiles.relationship, "self"),
    )).limit(1);
    if (existing) return NextResponse.json({ code: "PRIMARY_PROFILE_EXISTS", message: "A primary profile already exists." }, { status: 409 });
  }

  const id = randomUUID();
  try {
    const encrypted = encryptProfileData(parsed.data.data, user.id, id);
    const basis = parsed.data.relationship === "self" ? "self" : parsed.data.authorizationBasis!;
    await db.insert(personProfiles).values({
      id, ownerUserId: user.id, relationship: parsed.data.relationship, authorizationBasis: basis,
      authorizationConfirmedAt: new Date(), dataCiphertext: encrypted.ciphertext, encryptionKeyVersion: encrypted.keyVersion,
    });
    return NextResponse.json({ id, relationship: parsed.data.relationship, data: parsed.data.data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ code: "PROFILE_UNAVAILABLE", message: "Profile data could not be stored. Check the encryption configuration." }, { status: 503 });
  }
}
