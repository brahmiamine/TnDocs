import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Socket } from "node:net";
import { scanWithClamAv } from "../src/modules/dossiers/clamav";

type Reply = (socket: Socket) => void;
/** In-process TCP fixture only. These tests verify the protocol and fail-closed
 * behavior; they do not assert that real malware or definitions were checked. */
async function scannerFixture(version: Reply, scan: Reply, run: (endpoint: { host: string; port: number; timeoutMs: number }) => Promise<void>) {
  const sockets = new Set<Socket>(); let scanCount = 0;
  const server = createServer({ allowHalfOpen: true }, socket => {
    sockets.add(socket); socket.on("error", () => undefined); socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0); let command: string | null = null; let answered = false;
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (!command) {
        const end = buffer.indexOf(0); if (end < 0) return;
        command = buffer.subarray(0, end).toString("ascii"); buffer = buffer.subarray(end + 1);
        if (command === "zVERSION") { answered = true; version(socket); return; }
        if (command !== "zINSTREAM") { socket.destroy(); return; }
      }
      while (!answered && buffer.length >= 4) {
        const size = buffer.readUInt32BE(0);
        if (buffer.length < size + 4) return;
        buffer = buffer.subarray(size + 4);
        if (size === 0) { answered = true; scanCount++; scan(socket); return; }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_SERVER_ADDRESS");
  try { await run({ host: "127.0.0.1", port: address.port, timeoutMs: 1000 }); return scanCount; }
  finally { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const fresh = () => `ClamAV 1.4.3/28000/${new Date().toUTCString()}\0`;
const request = Buffer.from("fictional bytes without malware");

test("ClamAV protocol accepts only exact framed stream OK and parses FOUND", async () => {
  await scannerFixture(socket => socket.end(fresh()), socket => socket.end("stream: OK\0"), async endpoint => {
    assert.equal(await scanWithClamAv(request, endpoint), "clean");
  });
  await scannerFixture(socket => socket.end(fresh()), socket => socket.end("stream: Eicar-Test-Signature FOUND\0"), async endpoint => {
    assert.equal(await scanWithClamAv(request, endpoint), "infected");
  });
});

test("version connection ending without a NUL rejects promptly rather than hanging", { timeout: 2000 }, async () => {
  const count = await scannerFixture(socket => socket.end(fresh().slice(0, -1)), socket => socket.end("stream: OK\0"), async endpoint => {
    await assert.rejects(() => scanWithClamAv(request, endpoint), /incomplete|invalid|closed/i);
  });
  assert.equal(count, 0);
});

test("version and scan abrupt closes reject without waiting indefinitely", { timeout: 4000 }, async () => {
  await scannerFixture(socket => socket.destroy(), socket => socket.end("stream: OK\0"), async endpoint => { await assert.rejects(() => scanWithClamAv(request, endpoint), /closed|incomplete|reset/i); });
  await scannerFixture(socket => socket.end(fresh()), socket => socket.destroy(), async endpoint => { await assert.rejects(() => scanWithClamAv(request, endpoint), /closed|incomplete|reset/i); });
});

test("stale or malformed version information prevents sending the file", async () => {
  for (const response of [`ClamAV 1.4.3/28000/${new Date(Date.now() - 8 * 86400000).toUTCString()}\0`, "garbage\0"]) {
    const count = await scannerFixture(socket => socket.end(response), socket => socket.end("stream: OK\0"), async endpoint => { await assert.rejects(() => scanWithClamAv(request, endpoint), /outdated|version/i); });
    assert.equal(count, 0);
  }
});

test("malformed scanner replies including NOT OK and an unframed OK fail closed", async () => {
  for (const response of ["stream: NOT OK\0", "other: OK\0", "stream: OK", "stream: OK\0trailing", "stream: OK\n\0", "stream: UNKNOWN FOUNDISH\0"]) {
    await scannerFixture(socket => socket.end(fresh()), socket => socket.end(response), async endpoint => { await assert.rejects(() => scanWithClamAv(request, endpoint), /invalid|incomplete|protocol/i); });
  }
});

test("both scanner commands bound responses to 8192 bytes", async () => {
  await scannerFixture(socket => socket.end("x".repeat(8193)), socket => socket.end("stream: OK\0"), async endpoint => { await assert.rejects(() => scanWithClamAv(request, endpoint), /large|limit/i); });
  await scannerFixture(socket => socket.end(fresh()), socket => socket.end("x".repeat(8193)), async endpoint => { await assert.rejects(() => scanWithClamAv(request, endpoint), /large|limit/i); });
});

test("fragmented framed responses and multi-chunk uploads remain compatible", async () => {
  await scannerFixture(socket => { const response = fresh(); socket.write(response.slice(0, 10)); setImmediate(() => socket.end(response.slice(10))); }, socket => { socket.write("stream: "); setImmediate(() => socket.end("OK\0")); }, async endpoint => {
    assert.equal(await scanWithClamAv(Buffer.alloc(150000, 0x61), endpoint), "clean");
  });
});

test("an absolute deadline bounds a scanner that trickles unterminated bytes", { timeout: 3000 }, async () => {
  await scannerFixture(socket => socket.end(fresh()), socket => {
    const timer = setInterval(() => { if (!socket.destroyed) socket.write("x"); }, 10);
    socket.once("close", () => clearInterval(timer));
  }, async endpoint => { await assert.rejects(() => scanWithClamAv(request, { ...endpoint, timeoutMs: 100 }), /timed out/i); });
});
