import { isFeatureEnabled } from '@/modules/administration/service';
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '@/platform/database/client';
import { pushSubscriptions } from '@/modules/notifications/db-schema';
import { savePushSubscription } from '@/modules/notifications/service';
import { pushConfigured } from '@/modules/notifications/delivery';
import { hashSecretToken } from '@/modules/identity/tokens';
import { getCurrentUser } from '@/modules/identity/service';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
export async function GET() {
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  const configured = pushConfigured() && await isFeatureEnabled('push');
  return NextResponse.json({ configured, publicKey: configured ? process.env.VAPID_PUBLIC_KEY : null }, { headers: privateHeaders });
}
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  if (!database || !pushConfigured() || !await isFeatureEnabled('push')) return failure('SERVICE_UNAVAILABLE', 503);
  const parsed = z.object({ consent: z.literal(true), subscription: z.unknown() }).strict().safeParse(await readJsonBody(request)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  try { const id = await savePushSubscription(user.id, parsed.data.subscription); return NextResponse.json({ id }, { status: 201, headers: privateHeaders }); }
  catch (error) { return failure(error instanceof z.ZodError ? 'INVALID_INPUT' : 'SERVICE_UNAVAILABLE', error instanceof z.ZodError ? 400 : 503); }
}
export async function DELETE(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  if (!database) return failure('SERVICE_UNAVAILABLE', 503);
  const parsed = z.object({ endpoint: z.string().url().max(4096).optional(), all: z.boolean().optional() }).strict().refine(value => value.endpoint || value.all === true).safeParse(await readJsonBody(request)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  await database.delete(pushSubscriptions).where(and(eq(pushSubscriptions.ownerUserId, user.id), parsed.data.endpoint ? eq(pushSubscriptions.endpointHash, hashSecretToken(parsed.data.endpoint)) : undefined));
  return NextResponse.json({ removed: true }, { headers: privateHeaders });
}
