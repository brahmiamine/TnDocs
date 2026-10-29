import { NextResponse } from 'next/server';
import { z } from 'zod';
import { userHasRole } from '@/modules/identity/authorization';
import { failure, privateHeaders } from '@/modules/community/http';
import { listManagedUsers } from '@/modules/administration/users';
export async function GET(request: Request) {
  const { user } = await userHasRole('admin'); if (!user) return failure('FORBIDDEN', 403);
  const before = new URL(request.url).searchParams.get('before') ?? undefined;
  if (before && !z.string().uuid().safeParse(before).success) return failure('INVALID_INPUT', 400);
  try { const users = await listManagedUsers(user.id, before); return NextResponse.json({ users, nextCursor: users.length === 100 ? users[users.length - 1].id : null }, { headers: privateHeaders }); }
  catch (error) { return failure(error instanceof Error && error.message === 'FORBIDDEN' ? 'FORBIDDEN' : 'SERVICE_UNAVAILABLE', error instanceof Error && error.message === 'FORBIDDEN' ? 403 : 503); }
}
