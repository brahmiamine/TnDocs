import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { userHasRole } from '@/modules/identity/authorization';
import { moderationSchema } from '@/modules/community/schema';
import { moderateSubmission } from '@/modules/community/service';
import { failure, privateHeaders } from '@/modules/community/http';
export async function PATCH(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await userHasRole('moderator'); if (!user) return failure('FORBIDDEN', 403);
  const { submissionId } = await params;
  if (!z.string().uuid().safeParse(submissionId).success) return failure('NOT_FOUND', 404);
  const parsed = moderationSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return failure('INVALID_INPUT', 400);
  try {
    await moderateSubmission(submissionId, user.id, parsed.data.expectedStatus, parsed.data.status, parsed.data.comment);
    return NextResponse.json({ status: parsed.data.status }, { headers: privateHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNAVAILABLE';
    return failure(code, code === 'NOT_FOUND' ? 404 : ['CONFLICT', 'INVALID_TRANSITION'].includes(code) ? 409 : 503);
  }
}
