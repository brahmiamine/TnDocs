import type { Readable } from "node:stream";

/** Opaque encrypted-object storage. Authorization and encryption belong to callers. */
export interface StorageAdapter {
  put(key: string, data: Uint8Array): Promise<void>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
