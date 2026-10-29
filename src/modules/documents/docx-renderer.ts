import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";

export async function renderDocumentDocx(title: string, body: string, locale: "fr" | "ar") {
  const rtl = locale === "ar";
  const paragraphs = body.split(/\r?\n/).map((line) => new Paragraph({
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { after: 180, line: 360 },
    children: [new TextRun({ text: line || " ", rightToLeft: rtl, font: "Arial", size: 24 })],
  }));
  const document = new Document({
    title,
    styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
    sections: [{ properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } }, children: [
      new Paragraph({
        bidirectional: rtl, alignment: rtl ? AlignmentType.CENTER : AlignmentType.CENTER,
        spacing: { after: 360 }, heading: "Heading1",
        children: [new TextRun({ text: title, bold: true, rightToLeft: rtl, font: "Arial", size: 32 })],
      }),
      ...paragraphs,
    ] }],
  });
  return Packer.toBuffer(document);
}
