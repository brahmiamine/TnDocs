import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { createHash } from "node:crypto";
import { isPublicAddress, validateSourceUrl } from "./network-policy";

const maxBytes = 2 * 1024 * 1024;
/** Each redirect and every DNS answer are checked; the socket uses the checked address, never a second lookup. */
export async function fetchSourceSnapshot(raw: string, allowedHosts?: string[], redirectCount = 0, originalHost?: string): Promise<{ sha256: string; bytes: number; mimeType: string; textPreview: string; finalUrl: string; data: Buffer }> {
  const url = validateSourceUrl(raw, allowedHosts);
  if (originalHost && url.hostname !== originalHost || redirectCount > 3) throw new Error("SOURCE_REDIRECT_NOT_ALLOWED");
  const resolved = await Promise.race([lookup(url.hostname, { all: true, verbatim: true }), new Promise<never>((_, reject) => { const timeout = setTimeout(() => reject(new Error("SOURCE_DNS_TIMEOUT")), 5000); timeout.unref(); })]);
  if (!resolved.length || resolved.some(row => !isPublicAddress(row.address))) throw new Error("SOURCE_ADDRESS_NOT_ALLOWED");
  const selected = resolved[0];
  const response = await new Promise<{ status: number; location?: string; bytes: Buffer; mimeType: string }>((resolve, reject) => {
    const req = request(url, {
      method: "GET", timeout: 10_000, agent: false,
      headers: { "User-Agent": "TnDocs-source-monitor/1.0", "Accept": "text/html,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Accept-Encoding": "identity" },
      lookup: (_host, _options, callback) => callback(null, selected.address, selected.family),
    }, res => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) { const location = res.headers.location; res.resume(); resolve({ status, location, bytes: Buffer.alloc(0), mimeType: "" }); return; }
      if (status !== 200) { res.resume(); reject(new Error(status === 403 ? "SOURCE_ACCESS_FORBIDDEN" : "SOURCE_HTTP_ERROR")); return; }
      const mimeType = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (!["text/html", "text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(mimeType)) { res.destroy(); reject(new Error("SOURCE_CONTENT_TYPE_NOT_ALLOWED")); return; }
      if (Number(res.headers["content-length"] ?? 0) > maxBytes) { res.destroy(); reject(new Error("SOURCE_TOO_LARGE")); return; }
      const chunks: Buffer[] = []; let length = 0;
      res.on("data", (chunk: Buffer) => { length += chunk.length; if (length > maxBytes) { res.destroy(); reject(new Error("SOURCE_TOO_LARGE")); } else chunks.push(chunk); });
      res.on("error", reject); res.on("end", () => resolve({ status, bytes: Buffer.concat(chunks), mimeType }));
    });
    const timer = setTimeout(() => req.destroy(new Error("SOURCE_TIMEOUT")), 15_000); timer.unref();
    req.on("close", () => clearTimeout(timer)); req.on("timeout", () => req.destroy(new Error("SOURCE_TIMEOUT"))); req.on("error", reject); req.end();
  });
  if (response.status >= 300 && response.status < 400) {
    if (!response.location) throw new Error("SOURCE_INVALID_REDIRECT");
    return fetchSourceSnapshot(new URL(response.location, url).toString(), allowedHosts, redirectCount + 1, originalHost ?? url.hostname);
  }
  const textPreview = response.mimeType.startsWith("text/") ? response.bytes.toString("utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 4000) : "";
  return { sha256: createHash("sha256").update(response.bytes).digest("hex"), bytes: response.bytes.length, mimeType: response.mimeType, textPreview, finalUrl: url.toString(), data: response.bytes };
}
