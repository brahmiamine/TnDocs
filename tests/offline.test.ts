import assert from "node:assert/strict";
import { test } from "node:test";
import { OfflineVault, type OfflineStorage, type VaultRecord, type DraftRecord, type OfflineDraft, recoveryDecision } from "../src/modules/offline/vault";

class MemoryStorage implements OfflineStorage {
  vaults = new Map<string, VaultRecord>();
  drafts = new Map<string, DraftRecord>();
  async getVault(ownerId: string) { return this.vaults.get(ownerId); }
  async createVault(ownerId: string, value: VaultRecord) { if (this.vaults.has(ownerId)) return false; this.vaults.set(ownerId, value); return true; }
  async getDraft(ownerId: string, documentId: string) { return this.drafts.get(`${ownerId}/${documentId}`); }
  async putDraft(ownerId: string, documentId: string, value: DraftRecord) { this.drafts.set(`${ownerId}/${documentId}`, value); }
  async clearAccount(ownerId: string) { this.vaults.delete(ownerId); for (const key of this.drafts.keys()) if (key.startsWith(`${ownerId}/`)) this.drafts.delete(key); }
}
const draft = (revision = 4): OfflineDraft => ({ document: { id: "document-1", title: "Privé", status: "draft", documentType: "editable", formSchema: null, revision, content: { locale: "ar", body: "وثيقة خاصة", answers: { nom: "Secret" } } }, expectedRevision: revision, pending: true, savedAt: "2026-10-29T12:00:00.000Z" });

test("encrypted vault never stores plaintext and authenticates secret, owner and document", async () => {
  const storage = new MemoryStorage();
  const vault = new OfflineVault(storage, "alice");
  await vault.create("secret-phrase-longue");
  await vault.save(draft());
  assert.equal(JSON.stringify([...storage.drafts.values()]).includes("Secret"), false);
  assert.equal(JSON.stringify([...storage.drafts.values()]).includes("وثيقة"), false);
  assert.deepEqual(await vault.read("document-1"), draft());
  vault.lock();
  await assert.rejects(vault.read("document-1"), /LOCKED/);
  await assert.rejects(vault.unlock("incorrect-secret"));
  await vault.unlock("secret-phrase-longue");
  assert.equal((await vault.read("document-1"))?.expectedRevision, 4);
  storage.vaults.set("bob", storage.vaults.get("alice")!);
  await assert.rejects(new OfflineVault(storage, "bob").unlock("secret-phrase-longue"));
  storage.drafts.set("alice/another", storage.drafts.get("alice/document-1")!);
  await assert.rejects(vault.read("another"));
});

test("corruption is detected and account clearing preserves another account", async () => {
  const storage = new MemoryStorage();
  const alice = new OfflineVault(storage, "alice");
  const bob = new OfflineVault(storage, "bob");
  await alice.create("secret-alice-longue"); await bob.create("secret-bob-longue");
  await alice.save(draft()); await bob.save(draft());
  const record = storage.drafts.get("alice/document-1")!;
  storage.drafts.set("alice/document-1", { ...record, ciphertext: record.ciphertext.slice(0, -6) + "AAAAAA" });
  await assert.rejects(alice.read("document-1"));
  await alice.clear();
  assert.equal(alice.unlocked, false);
  assert.equal(storage.vaults.has("alice"), false);
  assert.ok(await bob.read("document-1"));
});

test("concurrent local saves are serialized and a lock prevents later writes", async () => {
  const storage = new MemoryStorage();
  const vault = new OfflineVault(storage, "alice");
  await vault.create("secret-phrase-longue");
  await Promise.all([vault.save(draft(4)), vault.save(draft(5)), vault.save(draft(6))]);
  assert.equal((await vault.read("document-1"))?.expectedRevision, 6);
  vault.lock();
  await assert.rejects(vault.save(draft()));
});

test("remote changes always require conflict choice and clean caches never overwrite server", () => {
  assert.equal(recoveryDecision(draft(4), 5), "conflict");
  assert.equal(recoveryDecision(draft(4), 4), "restore-pending");
  assert.equal(recoveryDecision({ ...draft(4), pending: false }, 5), "server");
  assert.equal(recoveryDecision(draft(6), 4), "conflict");
});


test("simultaneous enablement cannot overwrite an existing account encryption key", async () => {
  const storage = new MemoryStorage();
  const first = new OfflineVault(storage, "alice");
  const second = new OfflineVault(storage, "alice");
  const attempts = await Promise.allSettled([first.create("first-secret-longue"), second.create("second-secret-longue")]);
  assert.equal(attempts.filter((result) => result.status === "fulfilled").length, 1);
  const winner = first.unlocked ? first : second;
  await winner.save(draft());
  assert.equal((await winner.read("document-1"))?.expectedRevision, 4);
});
