import { NextResponse } from 'next/server';
import { userHasRole } from '@/modules/identity/authorization';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
import { createLegalVersion } from '@/modules/administration/service';
import { legalDraftSchema } from '@/modules/administration/schema';
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await userHasRole('admin'); if (!user) return failure('FORBIDDEN', 403);
  const parsed = legalDraftSchema.safeParse(await readJsonBody(request, 200 * 1024)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  try { const id = await createLegalVersion(user.id, parsed.data); return NextResponse.json({ id, status: 'draft' }, { status: 201, headers: privateHeaders }); }
  catch { return failure('SERVICE_UNAVAILABLE', 503); }
}
