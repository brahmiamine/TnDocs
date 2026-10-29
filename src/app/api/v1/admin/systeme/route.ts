import { NextResponse } from 'next/server';
import { userHasRole } from '@/modules/identity/authorization';
import { requireSameOrigin, readJsonBody } from '@/modules/identity/http';
import { failure, privateHeaders } from '@/modules/community/http';
import { getSystemSettings, getSystemOverview, saveSystemSettings } from '@/modules/administration/service';
import { settingsSchema } from '@/modules/administration/schema';
export async function GET() {
  if (!(await userHasRole('admin')).user) return failure('FORBIDDEN', 403);
  try { const [settings, overview] = await Promise.all([getSystemSettings(), getSystemOverview()]); return NextResponse.json({ settings, overview }, { headers: privateHeaders }); }
  catch { return failure('SERVICE_UNAVAILABLE', 503); }
}
export async function PUT(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  const { user } = await userHasRole('admin'); if (!user) return failure('FORBIDDEN', 403);
  const parsed = settingsSchema.safeParse(await readJsonBody(request, 64 * 1024)); if (!parsed.success) return failure('INVALID_INPUT', 400);
  try { await saveSystemSettings(user.id, parsed.data); return NextResponse.json({ saved: true }, { headers: privateHeaders }); }
  catch (error) { return failure(error instanceof Error && error.message === 'CONFLICT' ? 'CONFLICT' : 'SERVICE_UNAVAILABLE', error instanceof Error && error.message === 'CONFLICT' ? 409 : 503); }
}
