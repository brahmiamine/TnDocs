import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { shareAccessSchema } from "@/modules/sharing/policy";
import { saveRevisionSchema } from "@/modules/documents/schema";
import { editNominativeShare, ShareError } from "@/modules/sharing/service";
import { shareFailure } from "@/modules/sharing/http";
const inputSchema = saveRevisionSchema.merge(shareAccessSchema).strict();
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: "VERIFIED_ACCOUNT_REQUIRED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const input = inputSchema.safeParse(await readJsonBody(request, 1024 * 1024));
    if (!input.success) throw new ShareError("INVALID_INPUT", 400);
    const result = await editNominativeShare(user.id, input.data.token, input.data);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return shareFailure(error); }
}
