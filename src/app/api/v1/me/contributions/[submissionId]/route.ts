import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { getCurrentUser } from '@/modules/identity/service';
import { contributionSchema } from '@/modules/community/schema';
import { reviseSubmission } from '@/modules/community/service';
import { failure, privateHeaders } from '@/modules/community/http';
export async function PATCH(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  const { submissionId } = await params; if (!z.string().uuid().safeParse(submissionId).success) return failure('NOT_FOUND', 404);
  const parsed = contributionSchema.safeParse(await readJsonBody(request, 32 * 1024)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  try { await reviseSubmission(submissionId, user.id, parsed.data.kind, { title: parsed.data.title, body: parsed.data.body, sourceUrl: parsed.data.sourceUrl }); return NextResponse.json({ status: 'submitted' }, { headers: privateHeaders }); }
  catch (error) { const code = error instanceof Error ? error.message : 'UNAVAILABLE'; return failure(code, code === 'NOT_FOUND' ? 404 : code === 'CONFLICT' ? 409 : 503); }
}
