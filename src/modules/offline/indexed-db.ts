import type { OfflineStorage, DraftRecord, VaultRecord } from "./vault";

const dbName = "tndocs-private-drafts-v1";
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error("LOCAL_STORAGE_UNAVAILABLE")); return; }
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("vaults")) db.createObjectStore("vaults");
      if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("LOCAL_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("LOCAL_STORAGE_BLOCKED"));
  });
}
async function transact<T>(store: "vaults" | "drafts", mode: IDBTransactionMode, operation: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, mode);
      const request = operation(transaction.objectStore(store));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error("LOCAL_STORAGE_WRITE_FAILED"));
      transaction.onerror = () => reject(transaction.error ?? new Error("LOCAL_STORAGE_WRITE_FAILED"));
    });
  } finally { db.close(); }
}
const key = (ownerId: string, documentId: string) => [ownerId, documentId];
export const indexedDbStorage: OfflineStorage = {
  getVault: (ownerId) => transact("vaults", "readonly", (store) => store.get(ownerId)) as Promise<VaultRecord | undefined>,
  createVault: async (ownerId, value) => {
    try { await transact("vaults", "readwrite", (store) => store.add(value, ownerId)); return true; }
    catch (error) { if (error instanceof DOMException && error.name === "ConstraintError") return false; throw error; }
  },
  getDraft: (ownerId, documentId) => transact("drafts", "readonly", (store) => store.get(key(ownerId, documentId))) as Promise<DraftRecord | undefined>,
  putDraft: async (ownerId, documentId, value) => { await transact("drafts", "readwrite", (store) => store.put(value, key(ownerId, documentId))); },
  async clearAccount(ownerId) {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(["vaults", "drafts"], "readwrite");
        transaction.objectStore("vaults").delete(ownerId);
        const request = transaction.objectStore("drafts").openKeyCursor(IDBKeyRange.bound([ownerId], [ownerId, []]));
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) { transaction.objectStore("drafts").delete(cursor.primaryKey); cursor.continue(); }
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error("LOCAL_STORAGE_CLEAR_FAILED"));
        transaction.onerror = () => reject(transaction.error ?? new Error("LOCAL_STORAGE_CLEAR_FAILED"));
      });
    } finally { db.close(); }
  },
};
