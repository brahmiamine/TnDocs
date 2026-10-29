import { submissionGet, submissionPost } from '@/modules/community/http';
export async function GET() { return submissionGet(true); }
export async function POST(request: Request) { return submissionPost(request, true); }
