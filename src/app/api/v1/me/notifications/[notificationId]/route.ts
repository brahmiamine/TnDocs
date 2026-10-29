import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { database } from '@/platform/database/client';
import { notifications } from '@/modules/notifications/db-schema';
import { getCurrentUser } from '@/modules/identity/service';
import { requireSameOrigin } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
export async function PATCH(request: Request, { params }: { params: Promise<{ notificationId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  if (!database) return failure('SERVICE_UNAVAILABLE', 503);
  const { notificationId } = await params; if (!z.string().uuid().safeParse(notificationId).success) return failure('NOT_FOUND', 404);
  const [row] = await database.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, notificationId), eq(notifications.ownerUserId, user.id))).limit(1);
  if (!row) return failure('NOT_FOUND', 404);
  await database.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.ownerUserId, user.id)));
  return NextResponse.json({ read: true }, { headers: privateHeaders });
}
