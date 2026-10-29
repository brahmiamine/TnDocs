import { env } from "@/platform/config/env";
import { LocalStorageAdapter } from "@/platform/storage/local";

function storage() { return new LocalStorageAdapter(env.STORAGE_ROOT); }
export function attachmentStorageKey(ownerId: string, fileId: string) { return `${ownerId}/${fileId}.enc`; }
export async function writeEncryptedAttachment(storageKey: string, payload: Buffer) { await storage().put(storageKey, payload); }
export async function readEncryptedAttachment(storageKey: string) {
  const chunks: Buffer[] = [];
  for await (const chunk of await storage().getStream(storageKey)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
export async function deleteStoredAttachment(storageKey: string) { await storage().delete(storageKey); }
