import { NextResponse } from "next/server";
import { listPublishedGuides } from "@/modules/procedures/service";
export async function GET() {
  try { return NextResponse.json(await listPublishedGuides(), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ code: "SERVICE_UNAVAILABLE" }, { status: 503 }); }
}
