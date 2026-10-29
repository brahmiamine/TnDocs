import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/identity/service';
import { userHasRole } from '@/modules/identity/authorization';
import { database } from '@/platform/database/client';
import { isRateLimited } from '@/modules/identity/rate-limit';
import { hashSecretToken } from '@/modules/identity/tokens';
import { readJsonBody, requireSameOrigin } from '@/modules/identity/http';
import { contactSchema, contributionSchema } from './schema';
import { createSubmission, listSubmissions } from './service';

export const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
export function failure(code: string, status: number) { return NextResponse.json({ code }, { status, headers: privateHeaders }); }
export async function submissionGet(support: boolean, admin = false) {
  const user = admin ? (await userHasRole('moderator')).user : await getCurrentUser();
  if (!user) return failure('UNAUTHENTICATED_OR_FORBIDDEN', admin ? 403 : 401);
  if (!database) return failure('SERVICE_UNAVAILABLE', 503);
  try { return NextResponse.json({ submissions: await listSubmissions(admin ? null : user.id, support) }, { headers: privateHeaders }); }
  catch { return failure('SERVICE_UNAVAILABLE', 503); }
}
export async function submissionPost(request: Request, support: boolean) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const user = await getCurrentUser(); if (!user) return failure('UNAUTHENTICATED', 401);
  if (!database) return failure('SERVICE_UNAVAILABLE', 503);
  const input = await readJsonBody(request, 32 * 1024);
  const parsed = support ? contactSchema.safeParse(input) : contributionSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ code: 'INVALID_INPUT', fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400, headers: privateHeaders });
  try {
    if (await isRateLimited(hashSecretToken(`community:${user.id}`), 10, 60 * 60 * 1000)) return failure('RATE_LIMITED', 429);
    const value = parsed.data;
    const kind = 'kind' in value && (value.kind === 'template_request' || value.kind === 'proposal' || value.kind === 'report') ? value.kind : 'support';
    const id = await createSubmission(user.id, kind, value.locale,
      { title: value.title, body: value.body, ...('sourceUrl' in value && typeof value.sourceUrl === 'string' ? { sourceUrl: value.sourceUrl } : {}) });
    return NextResponse.json({ id, status: 'submitted' }, { status: 201, headers: privateHeaders });
  } catch { return failure('SERVICE_UNAVAILABLE', 503); }
}
