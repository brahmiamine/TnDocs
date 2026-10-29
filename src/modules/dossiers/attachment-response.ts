const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function attachmentDisposition(mimeType: string, inline: boolean) {
  const extension = extensions[mimeType];
  const disposition = inline && extension ? "inline" : "attachment";
  return `${disposition}; filename="tndocs-piece.${extension ?? "bin"}"`;
}
