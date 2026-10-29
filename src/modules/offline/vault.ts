import type { SecondaryDocumentSection } from "@/modules/documents/schema";
import type { RichDocument } from "@/modules/documents/rich-document";
import type { FormSchema } from "@/modules/documents/form-schema";

export type OfflineDocument = {
  id: string; title: string; status: string; documentType: string; revision: number; formSchema: FormSchema | null;
  content: { locale: "fr" | "ar"; body: string; richDocument?: RichDocument; secondary?: SecondaryDocumentSection; answers: Record<string, unknown> };
};
export type OfflineDraft = { document: OfflineDocument; expectedRevision: number; pending: boolean; savedAt: string };
type Ciphertext = { version: 1; iv: string; ciphertext: string };
export type VaultRecord = { salt: string; verifier: Ciphertext };
export type DraftRecord = Ciphertext;
export interface OfflineStorage {
  getVault(ownerId: string): Promise<VaultRecord | undefined>;
  createVault(ownerId: string, value: VaultRecord): Promise<boolean>;
  getDraft(ownerId: string, documentId: string): Promise<DraftRecord | undefined>;
  putDraft(ownerId: string, documentId: string, value: DraftRecord): Promise<void>;
  clearAccount(ownerId: string): Promise<void>;
}

function encode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
const text = new TextEncoder();
async function derive(secret: string, salt: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", text.encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: decode(salt), iterations: 310_000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encrypt(key: CryptoKey, value: unknown, scope: string): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const result = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: text.encode(scope) }, key, text.encode(JSON.stringify(value)));
  return { version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(result)) };
}
async function decrypt(key: CryptoKey, value: Ciphertext, scope: string): Promise<unknown> {
  if (value.version !== 1) throw new Error("UNSUPPORTED_LOCAL_FORMAT");
  const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(value.iv), additionalData: text.encode(scope) }, key, decode(value.ciphertext));
  return JSON.parse(new TextDecoder().decode(result));
}

/** Nonextractable key remains in memory; only authenticated ciphertext enters storage. */
export class OfflineVault {
  private key: CryptoKey | null = null;
  private writes: Promise<void> = Promise.resolve();
  private generation = 0;
  constructor(private storage: OfflineStorage, readonly ownerId: string) {}
  get unlocked() { return this.key !== null; }
  async exists() { return Boolean(await this.storage.getVault(this.ownerId)); }
  private scope(documentId: string) { return JSON.stringify(["tndocs-offline-v1", this.ownerId, documentId]); }
  async create(secret: string) {
    if (secret.length < 12) throw new Error("LOCAL_SECRET_TOO_SHORT");
    if (await this.exists()) throw new Error("LOCAL_VAULT_EXISTS");
    const generation = this.generation;
    const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
    const key = await derive(secret, salt);
    const verifier = await encrypt(key, { verified: true }, this.scope("vault"));
    if (generation !== this.generation) throw new Error("LOCAL_VAULT_LOCKED");
    if (!await this.storage.createVault(this.ownerId, { salt, verifier })) throw new Error("LOCAL_VAULT_EXISTS");
    if (generation !== this.generation) throw new Error("LOCAL_VAULT_LOCKED");
    this.key = key;
  }
  async unlock(secret: string) {
    const generation = this.generation;
    const record = await this.storage.getVault(this.ownerId);
    if (!record) throw new Error("LOCAL_VAULT_MISSING");
    const key = await derive(secret, record.salt);
    const verified = await decrypt(key, record.verifier, this.scope("vault")) as { verified?: boolean };
    if (!verified?.verified || generation !== this.generation) throw new Error("LOCAL_VAULT_LOCKED");
    this.key = key;
  }
  lock() { this.generation++; this.key = null; }
  async save(draft: OfflineDraft) {
    if (!this.key) throw new Error("LOCAL_VAULT_LOCKED");
    const key = this.key;
    const generation = this.generation;
    // Serialize encryption and transactions: completion order cannot roll a draft back.
    const operation = this.writes.catch(() => {}).then(async () => {
      if (generation !== this.generation || !this.key) throw new Error("LOCAL_VAULT_LOCKED");
      const record = await encrypt(key, draft, this.scope(draft.document.id));
      if (generation !== this.generation || !this.key) throw new Error("LOCAL_VAULT_LOCKED");
      await this.storage.putDraft(this.ownerId, draft.document.id, record);
    });
    this.writes = operation;
    return operation;
  }
  async read(documentId: string): Promise<OfflineDraft | null> {
    if (!this.key) throw new Error("LOCAL_VAULT_LOCKED");
    await this.writes.catch(() => {});
    const generation = this.generation;
    const record = await this.storage.getDraft(this.ownerId, documentId);
    if (!record) return null;
    if (!this.key) throw new Error("LOCAL_VAULT_LOCKED");
    const result = await decrypt(this.key, record, this.scope(documentId)) as OfflineDraft;
    if (generation !== this.generation || !this.key) throw new Error("LOCAL_VAULT_LOCKED");
    if (result.document?.id !== documentId || !Number.isInteger(result.expectedRevision) || result.expectedRevision < 1 || typeof result.pending !== "boolean" || typeof result.document.content?.body !== "string") throw new Error("INVALID_LOCAL_DRAFT");
    return result;
  }
  async flush() { await this.writes; }
  async clear() {
    this.lock();
    await this.writes.catch(() => {});
    await this.storage.clearAccount(this.ownerId);
  }
}

export function recoveryDecision(local: OfflineDraft, serverRevision: number): "server" | "conflict" | "restore-pending" {
  if (!local.pending) return "server";
  return local.expectedRevision === serverRevision ? "restore-pending" : "conflict";
}
