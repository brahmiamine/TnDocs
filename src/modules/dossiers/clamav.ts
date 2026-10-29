import { createConnection, type Socket } from "node:net";
import { env } from "@/platform/config/env";

const MAX_RESPONSE_BYTES = 8192;
export type ClamAvEndpoint = { host: string; port: number; timeoutMs?: number };

function write(socket: Socket, value: Buffer) {
  return new Promise<void>((resolve, reject) => {
    socket.write(value, error => error ? reject(error) : resolve());
  });
}

/** clamd's z-prefixed protocol returns exactly one NUL-terminated frame.
 * An absolute deadline also bounds a peer trickling bytes or dropping its
 * connection before a terminator (a socket idle timeout alone cannot do that). */
function exchange(endpoint: ClamAvEndpoint, send: (socket: Socket) => Promise<void>, defaultTimeout: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: endpoint.host, port: endpoint.port });
    const chunks: Buffer[] = []; let byteSize = 0; let settled = false; let sent = false;
    const timer = setTimeout(() => fail(new Error("Antivirus protocol request timed out")), endpoint.timeoutMs ?? defaultTimeout);
    function fail(error: Error) {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy(); reject(error);
    }
    socket.on("error", fail);
    socket.on("end", () => fail(new Error("Antivirus protocol response is incomplete")));
    socket.on("close", () => fail(new Error("Antivirus protocol connection closed before a complete response")));
    socket.on("data", (chunk: Buffer) => {
      if (settled) return;
      byteSize += chunk.byteLength;
      if (byteSize > MAX_RESPONSE_BYTES) { fail(new Error("Antivirus protocol response exceeds size limit")); return; }
      chunks.push(chunk);
      if (!chunk.includes(0)) return;
      const bytes = Buffer.concat(chunks);
      // Trailing bytes, multiple frames and early replies are not a scan result.
      if (!sent || bytes.indexOf(0) !== bytes.length - 1) { fail(new Error("Antivirus protocol returned an invalid response")); return; }
      let response: string;
      try { response = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, -1)); }
      catch { fail(new Error("Antivirus protocol returned an invalid response")); return; }
      settled = true; clearTimeout(timer); socket.destroy(); resolve(response);
    });
    socket.on("connect", () => {
      void send(socket).then(() => { sent = true; socket.end(); }).catch(error => fail(error instanceof Error ? error : new Error("Antivirus protocol write failed")));
    });
  });
}

async function ensureFreshDatabase(endpoint: ClamAvEndpoint) {
  const response = await exchange(endpoint, socket => write(socket, Buffer.from("zVERSION\0", "utf8")), 10_000);
  const match = /^ClamAV [A-Za-z0-9][A-Za-z0-9.+_-]{0,127}\/[0-9]+\/([^\r\n\0]+)$/.exec(response);
  if (!match) throw new Error("Antivirus version response is invalid");
  const databaseDate = new Date(match[1]);
  const age = Date.now() - databaseDate.getTime();
  if (!Number.isFinite(databaseDate.getTime()) || age < -24 * 60 * 60 * 1000 || age > 7 * 24 * 60 * 60 * 1000) throw new Error("Antivirus signatures are outdated");
}

/** Endpoint injection is for local protocol tests; request payloads never select it. */
export async function scanWithClamAv(data: Buffer, configured?: ClamAvEndpoint): Promise<"clean" | "infected"> {
  const endpoint = configured ?? (env.CLAMAV_HOST ? { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT } : null);
  if (!endpoint) throw new Error("Antivirus scanning is not configured");
  if (!endpoint.host || !Number.isSafeInteger(endpoint.port) || endpoint.port < 1 || endpoint.port > 65535 || (endpoint.timeoutMs !== undefined && (!Number.isSafeInteger(endpoint.timeoutMs) || endpoint.timeoutMs < 1))) throw new Error("Antivirus endpoint configuration is invalid");
  await ensureFreshDatabase(endpoint);
  const result = await exchange(endpoint, async socket => {
    await write(socket, Buffer.from("zINSTREAM\0", "utf8"));
    for (let offset = 0; offset < data.length; offset += 64 * 1024) {
      const chunk = data.subarray(offset, Math.min(offset + 64 * 1024, data.length));
      const length = Buffer.alloc(4); length.writeUInt32BE(chunk.length);
      await write(socket, length); await write(socket, chunk);
    }
    await write(socket, Buffer.alloc(4));
  }, 20_000);
  if (result === "stream: OK") return "clean";
  if (/^stream: [^\x00-\x1f\x7f]+ FOUND$/.test(result)) return "infected";
  throw new Error("Antivirus scanner returned an invalid result");
}

export function detectAllowedMimeType(data: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (data.length >= 5 && data.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  return null;
}
