import assert from "node:assert/strict";
import test from "node:test";

let attachmentDisposition;
try {
  ({ attachmentDisposition } = await import("./attachment-response.ts"));
} catch {
  // Keep the first run red until the response helper is implemented.
}

test("supported dossier files can be previewed inline", () => {
  assert.equal(typeof attachmentDisposition, "function", "attachment disposition helper should be implemented");
  assert.equal(attachmentDisposition("application/pdf", true), 'inline; filename="tndocs-piece.pdf"');
  assert.equal(attachmentDisposition("image/jpeg", true), 'inline; filename="tndocs-piece.jpg"');
  assert.equal(attachmentDisposition("image/png", true), 'inline; filename="tndocs-piece.png"');
});

test("downloads remain attachments and unsupported types cannot be inlined", () => {
  assert.equal(attachmentDisposition("application/pdf", false), 'attachment; filename="tndocs-piece.pdf"');
  assert.equal(attachmentDisposition("text/html", true), 'attachment; filename="tndocs-piece.bin"');
});
