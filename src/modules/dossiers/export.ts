import { createHash } from "node:crypto";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFStream } from "pdf-lib";
import { strToU8, zipSync } from "fflate";

export type ExportFile = { mimeType: "application/pdf" | "image/jpeg" | "image/png" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"; data: Uint8Array };
export type ExportItem = { id: string; label: string; status: string; required: boolean; file?: ExportFile; omittedReason?: string };
export type ExportBudget = { maxBytes?: number; maxPages?: number };
const A4: [number, number] = [595.28, 841.89];
const MAX_PIXELS = 40_000_000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 200;

export function safeExportName(label: string, id: string, extension: string) {
  const cleaned = label.normalize("NFC").replace(/[\\/]+/g, "_").replace(/[^\p{L}\p{N} _-]/gu, "").replace(/^[_ ]+|[_ ]+$/g, "").slice(0, 100) || "piece";
  return `${cleaned}-${id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 36)}.${extension}`;
}

function validateBudget(files: ExportFile[], budget: ExportBudget) {
  const maxBytes = budget.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("INVALID_EXPORT_BUDGET");
  if (files.reduce((size, file) => size + file.data.byteLength, 0) > maxBytes) throw new Error("EXPORT_BYTE_LIMIT");
}

function imageDimensions(file: ExportFile) {
  const data = Buffer.from(file.data);
  let width = 0; let height = 0;
  if (file.mimeType === "image/png") {
    if (data.length < 24 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || data.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("IMAGE_TYPE");
    width = data.readUInt32BE(16); height = data.readUInt32BE(20);
  } else if (file.mimeType === "image/jpeg") {
    if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) throw new Error("IMAGE_TYPE");
    let offset = 2;
    while (offset + 4 < data.length) {
      if (data[offset] !== 0xff) throw new Error("IMAGE_TYPE");
      while (data[offset] === 0xff) offset++;
      const marker = data[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length > data.length) throw new Error("IMAGE_TYPE");
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 7) throw new Error("IMAGE_TYPE");
        height = data.readUInt16BE(offset + 3); width = data.readUInt16BE(offset + 5); break;
      }
      offset += length;
    }
  } else throw new Error("IMAGE_TYPE");
  if (width < 1 || height < 1 || width > 20000 || height > 20000 || width * height > MAX_PIXELS) throw new Error("IMAGE_DIMENSIONS");
  return { width, height };
}

async function appendPhoto(document: PDFDocument, file: ExportFile) {
  const { width, height } = imageDimensions(file);
  const image = file.mimeType === "image/png" ? await document.embedPng(file.data) : await document.embedJpg(file.data);
  const page = document.addPage(A4);
  const margin = 24;
  const factor = Math.min((A4[0] - margin * 2) / width, (A4[1] - margin * 2) / height);
  page.drawImage(image, { x: (A4[0] - width * factor) / 2, y: (A4[1] - height * factor) / 2, width: width * factor, height: height * factor });
}

export async function photoToPdf(file: ExportFile) {
  validateBudget([file], { maxBytes: 10 * 1024 * 1024 });
  const document = await PDFDocument.create();
  await appendPhoto(document, file);
  return document.save();
}

// Inspect parsed objects, including compressed object streams. Byte searches miss these.
function rejectActiveContent(document: PDFDocument) {
  const forbiddenKeys = new Set(["OpenAction", "AA", "JS", "JavaScript", "EmbeddedFiles", "XFA", "RichMediaContent", "RichMediaSettings", "AcroForm", "EF"]);
  const forbiddenActions = new Set(["JavaScript", "Launch", "GoToR", "GoToE", "SubmitForm", "ImportData", "Rendition", "RichMediaExecute", "URI"]);
  const inspect = (object: unknown, depth = 0): void => {
    if (depth > 40) throw new Error("UNSAFE_PDF");
    if (object instanceof PDFArray) {
      for (const value of object.asArray()) inspect(value, depth + 1);
      return;
    }
    const dict = object instanceof PDFStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) return;
    for (const [key, value] of dict.entries()) {
      if (forbiddenKeys.has(key.decodeText())) throw new Error("UNSAFE_PDF");
      if (key.decodeText() === "S" && value instanceof PDFName && forbiddenActions.has(value.decodeText())) throw new Error("UNSAFE_PDF");
      if (value instanceof PDFDict || value instanceof PDFStream || value instanceof PDFArray) inspect(value, depth + 1);
    }
  };
  inspect(document.catalog);
  for (const [, object] of document.context.enumerateIndirectObjects()) inspect(object);
}

export async function mergeDossierPdf(files: ExportFile[], budget: ExportBudget = {}) {
  validateBudget(files, budget);
  if (!files.length) throw new Error("NO_COMPATIBLE_FILES");
  const maxPages = budget.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new Error("INVALID_EXPORT_BUDGET");
  const merged = await PDFDocument.create();
  for (const file of files) {
    if (file.mimeType === "image/png" || file.mimeType === "image/jpeg") {
      if (merged.getPageCount() + 1 > maxPages) throw new Error("EXPORT_PAGE_LIMIT");
      await appendPhoto(merged, file);
    } else if (file.mimeType === "application/pdf") {
      let source: PDFDocument;
      try { source = await PDFDocument.load(file.data, { ignoreEncryption: false, throwOnInvalidObject: true }); }
      catch { throw new Error("INCOMPATIBLE_PDF"); }
      rejectActiveContent(source);
      if (source.getPageCount() < 1) throw new Error("INCOMPATIBLE_PDF");
      if (merged.getPageCount() + source.getPageCount() > maxPages) throw new Error("EXPORT_PAGE_LIMIT");
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        // The merged output is a static printout; interactive annotations never carry over.
        page.node.delete(PDFName.of("Annots"));
        merged.addPage(page);
      }
    } else throw new Error("INCOMPATIBLE_PDF");
  }
  const result = await merged.save();
  validateBudget([{ mimeType: "application/pdf", data: result }], budget);
  return result;
}

export async function buildDossierZip(title: string, items: ExportItem[], budget: ExportBudget = {}) {
  validateBudget(items.flatMap((item) => item.file ? [item.file] : []), budget);
  const files: Record<string, Uint8Array> = Object.create(null);
  const manifest = { title, exportedAt: new Date().toISOString(), officialValidation: false, notice: "Checklist personnelle. Cet export ne valide pas le dossier auprès d’une administration.", items: items.map((item) => {
    const extension = item.file?.mimeType === "application/pdf" ? "pdf" : item.file?.mimeType === "image/png" ? "png" : item.file?.mimeType === "image/jpeg" ? "jpg" : "docx";
    const path = item.file ? `pieces/${safeExportName(item.label, item.id, extension)}` : null;
    if (path && item.file) files[path] = item.file.data;
    return { id: item.id, label: item.label, status: item.status, required: item.required, included: Boolean(item.file), path, sha256: item.file ? createHash("sha256").update(item.file.data).digest("hex") : null, omittedReason: item.omittedReason ?? (item.file ? null : "missing") };
  }) };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 0 });
}
