import { submissionGet } from '@/modules/community/http';
export async function GET(request: Request) { return submissionGet(new URL(request.url).searchParams.get('support') === 'true', true); }
