import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "../src/platform/config/env";
import { preserveSourceOriginal, readSourceOriginal, deleteSourceOriginal } from "../src/modules/sources/originals";
test("Original source files stay encrypted and scoped to source/observation identifiers", async () => {
  const root = await mkdtemp(join(tmpdir(), "tndocs-source-originals-")), oldRoot = env.STORAGE_ROOT, oldKey = process.env.ATTACHMENT_ENCRYPTION_KEY_V1;
  env.STORAGE_ROOT = root; process.env.ATTACHMENT_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 28).toString("base64");
  const sourceId = randomUUID(), observationId = randomUUID(), bytes = Buffer.from("Fictional source original العربية français");
  try {
    const result = await preserveSourceOriginal(sourceId, observationId, bytes);
    const stored = await readFile(join(root, "source-originals", result.storageKey));
    assert.equal(stored.includes(bytes), false);
    assert.deepEqual(await readSourceOriginal(sourceId, observationId, result.storageKey, result.keyVersion), bytes);
    await assert.rejects(readSourceOriginal(randomUUID(), observationId, result.storageKey, result.keyVersion));
    await assert.rejects(readSourceOriginal(sourceId, randomUUID(), result.storageKey, result.keyVersion));
    await assert.rejects(readSourceOriginal(sourceId, observationId, result.storageKey, "v2"));
    await deleteSourceOriginal(result.storageKey);
    await assert.rejects(readSourceOriginal(sourceId, observationId, result.storageKey, result.keyVersion));
  } finally { env.STORAGE_ROOT = oldRoot; if (oldKey) process.env.ATTACHMENT_ENCRYPTION_KEY_V1 = oldKey; else delete process.env.ATTACHMENT_ENCRYPTION_KEY_V1; await rm(root, { recursive: true, force: true }); }
});
