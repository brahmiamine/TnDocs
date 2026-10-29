import { NextResponse } from 'next/server';
import { z } from 'zod';
import { userHasRole } from '@/modules/identity/authorization';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
import { actOnLegalVersion } from '@/modules/administration/service';
import { legalActionSchema } from '@/modules/administration/schema';
export async function PATCH(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await userHasRole('admin'); if (!user) return failure('FORBIDDEN', 403);
  const { versionId } = await params; if (!z.string().uuid().safeParse(versionId).success) return failure('NOT_FOUND', 404);
  const parsed = legalActionSchema.safeParse(await readJsonBody(request)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  try { await actOnLegalVersion(user.id, versionId, parsed.data); return NextResponse.json({ status: parsed.data.action === 'review' ? 'reviewed' : 'published' }, { headers: privateHeaders }); }
  catch (error) { const code = error instanceof Error ? error.message : ''; return failure(['NOT_FOUND', 'CONFLICT'].includes(code) ? code : 'SERVICE_UNAVAILABLE', code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : 503); }
}
