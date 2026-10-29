import { createConnection, type Socket } from "node:net";
import { env } from "@/platform/config/env";

function write(socket: Socket, value: Buffer) {
  return new Promise<void>((resolve, reject) => {
    socket.write(value, (error) => error ? reject(error) : resolve());
  });
}

function queryVersion(host: string, port: number) {
  return new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host, port });
    const chunks: Buffer[] = [];
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(10_000, () => fail(new Error("Antivirus version query timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      if (!chunk.includes(0)) return;
      if (settled) return;
      settled = true;
      const response = Buffer.concat(chunks).toString("utf8").replaceAll("\0", "").trim();
      socket.end();
      resolve(response);
    });
    socket.on("connect", () => socket.write(Buffer.from("zVERSION\0", "utf8")));
  });
}

async function ensureFreshDatabase(host: string, port: number) {
  const response = await queryVersion(host, port);
  const match = /^ClamAV [^/]+\/\d+\/(.+)$/.exec(response);
  const databaseDate = match ? new Date(match[1]) : new Date(Number.NaN);
  const age = Date.now() - databaseDate.getTime();
  if (!Number.isFinite(databaseDate.getTime()) || age < -24 * 60 * 60 * 1000 || age > 7 * 24 * 60 * 60 * 1000) {
    throw new Error("Antivirus signatures are outdated");
  }
}

export async function scanWithClamAv(data: Buffer): Promise<"clean" | "infected"> {
  if (!env.CLAMAV_HOST) throw new Error("Antivirus scanning is not configured");
  await ensureFreshDatabase(env.CLAMAV_HOST, env.CLAMAV_PORT);
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: env.CLAMAV_HOST, port: env.CLAMAV_PORT });
    const response: Buffer[] = [];
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(20_000, () => fail(new Error("Antivirus scan timed out")));
    socket.on("error", fail);
    socket.on("data", (chunk: Buffer) => response.push(chunk));
    socket.on("end", () => {
      if (settled) return;
      settled = true;
      const result = Buffer.concat(response).toString("utf8").replaceAll("\0", "").trim();
      if (result.endsWith("OK")) resolve("clean");
      else if (result.includes("FOUND")) resolve("infected");
      else reject(new Error("Antivirus scanner returned an invalid result"));
    });
    socket.on("connect", () => {
      void (async () => {
        await write(socket, Buffer.from("zINSTREAM\0", "utf8"));
        for (let offset = 0; offset < data.length; offset += 64 * 1024) {
          const chunk = data.subarray(offset, Math.min(offset + 64 * 1024, data.length));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          await write(socket, length);
          await write(socket, chunk);
        }
        await write(socket, Buffer.alloc(4));
        socket.end();
      })().catch((error: unknown) => fail(error instanceof Error ? error : new Error("Antivirus scan failed")));
    });
  });
}

export function detectAllowedMimeType(data: Buffer): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (data.length >= 5 && data.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  return null;
}

export function getImageDimensions(data: Buffer, mimeType: "image/jpeg" | "image/png") {
  if (mimeType === "image/png") {
    if (data.length < 24) return null;
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  let offset = 2;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 4 < data.length) {
    while (offset < data.length && data[offset] !== 0xff) offset += 1;
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) return null;
    const marker = data[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) return null;
    const segmentLength = data.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > data.length) return null;
    if (startOfFrame.has(marker)) {
      if (segmentLength < 7) return null;
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}
