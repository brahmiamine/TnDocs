import { NextResponse } from "next/server";
import { getCurrentUser } from "@/modules/identity/service";
import { buildAccountDataExport } from "@/modules/privacy/account-export";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const exported = await buildAccountDataExport(user);
    return new Response(JSON.stringify(exported, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="tndocs-data-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ code: "EXPORT_UNAVAILABLE", message: "The account data export could not be prepared." }, { status: 503 });
  }
}
