import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { strFromU8, unzipSync } from "fflate";
import { buildDossierZip, mergeDossierPdf, photoToPdf, safeExportName } from "../src/modules/dossiers/export";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1UAAAAASUVORK5CYII=", "base64");

test("export names cannot traverse ZIP directories or collide on punctuation", () => {
  assert.equal(safeExportName("../../passport\\scan", "a1", "pdf"), "passport_scan-a1.pdf");
  assert.equal(safeExportName("وثيقة", "a2", "pdf"), "وثيقة-a2.pdf");
});

test("ZIP carries exact original bytes and a manifest with missing items", async () => {
  const data = await buildDossierZip("dossier", [{ id: "1", label: "Photo", status: "added", required: true, file: { mimeType: "image/png", data: png } }, { id: "2", label: "Missing", status: "missing", required: true }]);
  const files = unzipSync(data);
  assert.deepEqual(Buffer.from(files["pieces/Photo-1.png"]), png);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  assert.equal(manifest.items.length, 2);
  assert.equal(manifest.items[1].included, false);
  assert.equal(manifest.officialValidation, false);
});

test("merge preserves PDF order and converts photos to A4 pages", async () => {
  const original = await PDFDocument.create();
  original.addPage([100, 200]); original.addPage([200, 100]);
  const result = await mergeDossierPdf([{ mimeType: "application/pdf", data: await original.save() }, { mimeType: "image/png", data: png }]);
  const merged = await PDFDocument.load(result);
  assert.equal(merged.getPageCount(), 3);
  assert.deepEqual(merged.getPage(0).getSize(), { width: 100, height: 200 });
  assert.equal(Math.round(merged.getPage(2).getWidth()), 595);
});

test("scan conversion rejects MIME spoofing and pixel bombs", async () => {
  await assert.rejects(() => photoToPdf({ mimeType: "image/jpeg", data: png }), /IMAGE_TYPE/);
  const huge = Buffer.from(png); huge.writeUInt32BE(100000, 16); huge.writeUInt32BE(100000, 20);
  await assert.rejects(() => photoToPdf({ mimeType: "image/png", data: huge }), /IMAGE_DIMENSIONS/);
});

test("merge rejects damaged and active-content PDFs rather than exporting them", async () => {
  await assert.rejects(() => mergeDossierPdf([{ mimeType: "application/pdf", data: Buffer.from("%PDF-corrupt") }]), /INCOMPATIBLE_PDF/);
  const active = await PDFDocument.create(); active.addPage();
  active.catalog.set(PDFName.of("OpenAction"), active.context.obj({ S: PDFName.of("JavaScript"), JS: PDFString.of("app.alert('no')") }));
  await assert.rejects(async () => mergeDossierPdf([{ mimeType: "application/pdf", data: await active.save() }]), /UNSAFE_PDF/);
});

test("merge is all-or-nothing and enforces the configured page budget", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage(); pdf.addPage();
  await assert.rejects(async () => mergeDossierPdf([{ mimeType: "application/pdf", data: await pdf.save() }], { maxPages: 1 }), /PAGE_LIMIT/);
  await assert.rejects(() => mergeDossierPdf([]), /NO_COMPATIBLE_FILES/);
});

test("byte budget applies before conversion and ZIP assembly", async () => {
  await assert.rejects(() => mergeDossierPdf([{ mimeType: "image/png", data: png }], { maxBytes: 1 }), /BYTE_LIMIT/);
  await assert.rejects(() => buildDossierZip("title", [{ id: "p", label: "Photo", status: "added", required: false, file: { mimeType: "image/png", data: png } }], { maxBytes: 1 }), /BYTE_LIMIT/);
});

test("PDF form actions in compressed objects cannot bypass active-content checks", async () => {
  const source = await PDFDocument.create(); source.addPage();
  const dictionary = source.context.obj({ JS: PDFString.of("app.alert('no')") });
  source.context.register(dictionary);
  const data = await source.save({ useObjectStreams: true });
  assert.equal(Buffer.from(data).includes(Buffer.from("app.alert")), false);
  await assert.rejects(() => mergeDossierPdf([{ mimeType: "application/pdf", data }]), /UNSAFE_PDF/);
});

test("encrypted PDF is rejected without ignoring its encryption", async () => {
  const source = await PDFDocument.create(); source.addPage();
  source.context.trailerInfo.Encrypt = source.context.register(source.context.obj({ Filter: PDFName.of("Standard"), V: 1, R: 2 }));
  const data = await source.save();
  await assert.rejects(() => mergeDossierPdf([{ mimeType: "application/pdf", data }]), /INCOMPATIBLE_PDF/);
});
