import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { readJsonBody, requireSameOrigin } from "@/modules/identity/http";
import { shareAccessSchema } from "@/modules/sharing/policy";
import { accessNominativeShare, ShareError } from "@/modules/sharing/service";
import { shareFailure } from "@/modules/sharing/http";
export async function POST(request: Request) {
  const originError = requireSameOrigin(request); if (originError) return originError;
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: "VERIFIED_ACCOUNT_REQUIRED" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
    const input = shareAccessSchema.safeParse(await readJsonBody(request, 1024));
    if (!input.success) throw new ShareError("SHARE_UNAVAILABLE");
    const result = await accessNominativeShare(user.id, input.data.token);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return shareFailure(error); }
}
