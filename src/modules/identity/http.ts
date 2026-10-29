import { NextResponse } from "next/server";
import { env } from "@/platform/config/env";

export async function readJsonBody(request: Request, limitBytes = 16 * 1024): Promise<unknown | null> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limitBytes) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limitBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(env.APP_URL).origin) {
    return NextResponse.json({ code: "INVALID_ORIGIN", message: "Request origin is not allowed." }, { status: 403 });
  }
  return null;
}

export function serviceUnavailable() {
  return NextResponse.json({ code: "SERVICE_UNAVAILABLE", message: "Account service is not configured." }, { status: 503 });
}
