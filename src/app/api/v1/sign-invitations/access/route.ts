import { NextResponse } from "next/server";
import { getSignatureView, noStore } from "@/modules/signatures/service";
import { signatureFailure } from "@/modules/signatures/http";
export async function GET() { try { return NextResponse.json(await getSignatureView(),{headers:noStore}); } catch(error) { return signatureFailure(error); } }
