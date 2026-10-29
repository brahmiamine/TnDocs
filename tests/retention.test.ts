import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalStorageAdapter } from "../src/platform/storage/local";
import { canPurgeTrash, trashPurgeAfter, accountStorageQuota, canStoreBytes, exportArtifactExpired } from "../src/platform/retention/policy";

test("trash cannot be purged before 30 full days even at the boundary", () => {
  const trashed = new Date("2026-01-01T00:00:00.000Z");
  const due = trashPurgeAfter(trashed);
  assert.equal(due.toISOString(), "2026-01-31T00:00:00.000Z");
  assert.equal(canPurgeTrash({ status: "trash", purgeAfter: due }, new Date(due.getTime() - 1)), false);
  assert.equal(canPurgeTrash({ status: "trash", purgeAfter: due }, due), true);
  assert.equal(canPurgeTrash({ status: "draft", purgeAfter: due }, due), false);
  assert.equal(canPurgeTrash({ status: "trash", purgeAfter: new Date(Number.NaN) }, due), false);
});

test("quota is configurable and replacement subtracts the existing object only", () => {
  assert.equal(accountStorageQuota(), 100 * 1024 * 1024);
  assert.equal(accountStorageQuota("2048"), 2048);
  assert.throws(() => accountStorageQuota("-1"));
  assert.throws(() => accountStorageQuota("NaN"));
  assert.equal(canStoreBytes({ used: 1000, replacement: 100, incoming: 200, quota: 1100 }), true);
  assert.equal(canStoreBytes({ used: 1000, replacement: 99, incoming: 200, quota: 1100 }), false);
  assert.equal(canStoreBytes({ used: 100, replacement: 200, incoming: 1, quota: 1000 }), false);
});

test("only expired terminal export artifacts are collected", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  const old = new Date("2026-01-01T00:00:00Z");
  assert.equal(exportArtifactExpired({ kind: "document.export", status: "done", updatedAt: old }, now, 24), true);
  assert.equal(exportArtifactExpired({ kind: "document.export", status: "leased", updatedAt: old }, now, 24), false);
  assert.equal(exportArtifactExpired({ kind: "signature.export", status: "done", updatedAt: old }, now, 24), true);
  assert.equal(exportArtifactExpired({ kind: "catalog.sync", status: "done", updatedAt: old }, now, 24), false);
  assert.equal(exportArtifactExpired({ kind: "document.export", status: "done", updatedAt: now }, now, 24), false);
});

test("local storage is private, atomic, streamable, copyable and rejects traversal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tndocs-storage-"));
  const storage = new LocalStorageAdapter(dir);
  const owner = randomUUID(); const key = `${owner}/${randomUUID()}.enc`; const second = `${owner}/${randomUUID()}.enc`;
  try {
    await storage.put(key, Buffer.from("ciphertext"));
    assert.equal(await storage.exists(key), true);
    assert.equal((await stat(join(dir, key))).mode & 0o777, 0o600);
    assert.equal((await stat(join(dir, owner))).mode & 0o777, 0o700);
    assert.deepEqual(await readFile(join(dir, key)), Buffer.from("ciphertext"));
    const chunks = []; for await (const chunk of await storage.getStream(key)) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), "ciphertext");
    await storage.copy(key, second); assert.deepEqual(await readFile(join(dir, second)), Buffer.from("ciphertext"));
    await storage.delete(key); await storage.delete(key); assert.equal(await storage.exists(key), false);
    await assert.rejects(() => storage.put("../../public/evil", Buffer.from("no")), /INVALID_STORAGE_KEY/);
    assert.equal((await readdir(join(dir, owner))).some((file) => file.endsWith(".tmp")), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("local storage will not follow an object symlink outside its root", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tndocs-storage-"));
  const storage = new LocalStorageAdapter(dir);
  const owner = randomUUID(); const key = `${owner}/${randomUUID()}.enc`; const link = `${owner}/${randomUUID()}.enc`;
  try {
    await storage.put(key, Buffer.from("private"));
    await symlink(join(dir, key), join(dir, link));
    assert.equal(await storage.exists(link), false);
    await assert.rejects(() => storage.getStream(link));
    await storage.delete(link);
    assert.equal(await storage.exists(key), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test("cleanup removes an orphan temporary object left before its atomic rename", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tndocs-storage-"));
  const storage = new LocalStorageAdapter(dir);
  const owner = randomUUID(); const existing = `${owner}/${randomUUID()}.enc`; const missingId = randomUUID();
  try {
    await storage.put(existing, Buffer.from("keep"));
    const temp = join(dir, owner, `.${missingId}.enc.tmp`);
    await writeFile(temp, "partial ciphertext", { mode: 0o600 });
    await storage.delete(`${owner}/${missingId}.enc`);
    await assert.rejects(() => readFile(temp), /ENOENT/);
    assert.equal(await storage.exists(existing), true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
