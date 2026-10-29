import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 });
  return NextResponse.json({ user }, { headers: { "Cache-Control": "private, no-store" } });
}
