import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { extractDocxText, extractPdfText } from "../src/modules/sources/extraction";
function docx(xml: string, extras: Record<string, Uint8Array> = {}) { return zipSync({ "[Content_Types].xml": strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'), "word/document.xml": strToU8(xml), ...extras }); }
test("DOCX extraction preserves French/Arabic text and rejects macros/entities/traversal/bombs", () => {
  const bytes = docx('<w:document><w:body><w:p><w:r><w:t>Français &amp; عربي</w:t></w:r></w:p><w:p><w:r><w:t>Deuxième</w:t></w:r></w:p></w:body></w:document>');
  assert.match(extractDocxText(bytes), /Français & عربي/);
  assert.match(extractDocxText(bytes), /Deuxième/);
  assert.throws(() => extractDocxText(docx('<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><w:document/>')));
  assert.throws(() => extractDocxText(docx('<w:document/>', { "word/vbaProject.bin": new Uint8Array([1]) })));
  assert.throws(() => extractDocxText(docx('<w:document/>', { "../escape.txt": new Uint8Array([1]) })));
  assert.throws(() => extractDocxText(docx(`<w:document>${"x".repeat(3 * 1024 * 1024)}</w:document>`)));
});
test("PDF extraction reads a real generated document with bounded pages", async () => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage().drawText("Document fictif de verification", { font, x: 40, y: 700 });
  assert.match(await extractPdfText(await pdf.save()), /Document fictif de verification/);
  await assert.rejects(extractPdfText(new Uint8Array([1, 2, 3])));
});
