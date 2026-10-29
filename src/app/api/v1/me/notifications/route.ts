import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/identity/service';
import { listNotifications, getPreferences } from '@/modules/notifications/service';
import { failure, privateHeaders } from '@/modules/community/http';
export async function GET(request: Request) {
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  const requestedLocale = new URL(request.url).searchParams.get('locale');
  const locale = requestedLocale === 'fr' || requestedLocale === 'ar' ? requestedLocale : user.preferredLocale;
  try { return NextResponse.json({ notifications: await listNotifications(user.id, locale), preferences: await getPreferences(user.id) }, { headers: privateHeaders }); }
  catch { return failure('SERVICE_UNAVAILABLE', 503); }
}
