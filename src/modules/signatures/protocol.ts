import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
export function signatureDigest(content: unknown, revision: number) {
  return createHash("sha256").update(canonicalJson({ revision, content })).digest("hex");
}
export function canDecide(state: {status: string; verifiedAt: Date | null; expiresAt: Date; revokedAt: Date | null; documentStatus: string; expectedHash: string; revisionHash: string}) {
  return ["invited", "viewed"].includes(state.status) && state.verifiedAt !== null && state.expiresAt > new Date() && state.revokedAt === null && state.documentStatus !== "trash" && state.expectedHash === state.revisionHash;
}
export function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit=0; bit<8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Technical safety limits, not account quotas. Only browser-canvas compatible PNG. */
export function validateSignaturePng(bytes: Buffer): {width:number; height:number} {
  if (bytes.length > 256 * 1024 || bytes.length < 57 || bytes.subarray(0,8).toString("hex") !== "89504e470d0a1a0a") throw new Error("INVALID_SIGNATURE_PNG");
  let offset=8, width=0, height=0, channels=0, ended=false, dataStarted=false, dataEnded=false;
  const compressed: Buffer[]=[];
  while (offset < bytes.length) {
    if (offset+12 > bytes.length) throw new Error("TRUNCATED_SIGNATURE_PNG");
    const length=bytes.readUInt32BE(offset), type=bytes.toString("ascii",offset+4,offset+8);
    if (offset+12+length > bytes.length) throw new Error("TRUNCATED_SIGNATURE_PNG");
    const data=bytes.subarray(offset+8,offset+8+length);
    if (bytes.readUInt32BE(offset+8+length) !== crc32(bytes.subarray(offset+4,offset+8+length))) throw new Error("INVALID_SIGNATURE_PNG_CRC");
    if (offset===8 && type!=="IHDR") throw new Error("INVALID_SIGNATURE_PNG_ORDER");
    if (type==="IHDR") {
      if (offset!==8 || length!==13) throw new Error("INVALID_SIGNATURE_PNG_HEADER");
      width=data.readUInt32BE(0); height=data.readUInt32BE(4);
      channels=({0:1,2:3,4:2,6:4} as Record<number,number>)[data[9]] ?? 0;
      if (!width || !height || width>2048 || height>1024 || !channels || data[8]!==8 || data[10]!==0 || data[11]!==0 || data[12]!==0) throw new Error("UNSUPPORTED_SIGNATURE_PNG");
    } else if (type==="IDAT") {
      if (dataEnded) throw new Error("INVALID_SIGNATURE_PNG_ORDER");
      dataStarted=true; compressed.push(data);
    } else if (type==="IEND") {
      if (length!==0 || offset+12!==bytes.length || !compressed.length) throw new Error("INVALID_SIGNATURE_PNG_END");
      ended=true;
    } else {
      if (dataStarted) dataEnded=true;
      // Permit PNG ancillary chunks but never unknown critical chunks.
      if ((bytes[offset+4] & 32)===0) throw new Error("UNSUPPORTED_SIGNATURE_PNG_CHUNK");
    }
    offset+=length+12;
  }
  if (!ended) throw new Error("TRUNCATED_SIGNATURE_PNG");
  const rowSize=1+width*channels, expected=rowSize*height;
  if (expected>4*1024*1024) throw new Error("SIGNATURE_PNG_TOO_LARGE");
  const pixels=inflateSync(Buffer.concat(compressed), {maxOutputLength:expected});
  if (pixels.length!==expected) throw new Error("INVALID_SIGNATURE_PNG_PIXELS");
  for (let row=0;row<height;row++) if (pixels[row*rowSize]>4) throw new Error("INVALID_SIGNATURE_PNG_FILTER");
  return {width,height};
}
