import { NextResponse } from 'next/server';
import { z } from 'zod';
import { userHasRole } from '@/modules/identity/authorization';
import { readJsonBody, requireSameOrigin } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
import { userAccessSchema } from '@/modules/administration/user-policy';
import { changeManagedUserAccess } from '@/modules/administration/users';
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await userHasRole('admin'); if (!user) return failure('FORBIDDEN', 403);
  const { userId } = await params; if (!z.string().uuid().safeParse(userId).success) return failure('NOT_FOUND', 404);
  const parsed = userAccessSchema.safeParse(await readJsonBody(request)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  try { return NextResponse.json(await changeManagedUserAccess(user.id, userId, parsed.data), { headers: privateHeaders }); }
  catch (error) { const code = error instanceof Error ? error.message : ''; const allowed = ['FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'SELF_SUSPENSION_FORBIDDEN', 'LAST_ACTIVE_ADMIN', 'EMAIL_NOT_VERIFIED']; return failure(allowed.includes(code) ? code : 'SERVICE_UNAVAILABLE', code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : allowed.includes(code) ? 409 : 503); }
}
