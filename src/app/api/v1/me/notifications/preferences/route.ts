import { NextResponse } from 'next/server';
import { notificationPreferences } from '@/modules/notifications/db-schema';
import { preferenceSchema } from '@/modules/notifications/schema';
import { database } from '@/platform/database/client';
import { getCurrentUser } from '@/modules/identity/service';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
export async function PUT(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  if (!database) return failure('SERVICE_UNAVAILABLE', 503);
  const parsed = preferenceSchema.safeParse(await readJsonBody(request)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  const value = parsed.data;
  const preferences = { inApp: +value.inApp, email: +value.email, push: +value.push, pushConsentedAt: value.push && value.pushConsent ? new Date() : null };
  try { await database.insert(notificationPreferences).values({ ownerUserId: user.id, category: value.category, ...preferences }).onDuplicateKeyUpdate({ set: { ...preferences, updatedAt: new Date() } }); return NextResponse.json({ saved: true }, { headers: privateHeaders }); }
  catch { return failure('SERVICE_UNAVAILABLE', 503); }
}
