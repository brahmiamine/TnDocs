import { spawn } from "node:child_process";
import { unzipSync, strFromU8 } from "fflate";
const maxInput = 2 * 1024 * 1024, maxText = 200_000;
function decodeXmlText(value: string) {
  return value.replace(/&(?:amp|lt|gt|quot|apos);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    const common: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
    if (common[entity]) return common[entity];
    const point = entity.startsWith("&#x") ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "�";
  });
}
export function extractDocxText(data: Uint8Array): string {
  if (data.byteLength > maxInput || data.byteLength < 4 || data[0] !== 0x50 || data[1] !== 0x4b) throw new Error("SOURCE_INVALID_DOCX");
  let expanded = 0, entries = 0; const names = new Set<string>();
  const files = unzipSync(data, { filter: file => {
    entries++; expanded += file.originalSize;
    if (entries > 300 || !Number.isFinite(file.originalSize) || file.originalSize > maxInput || expanded > 10 * 1024 * 1024 || names.has(file.name) || file.name.includes("\\") || file.name.split("/").includes("..") || file.name.startsWith("/") || /vbaProject|\.exe$|\.dll$/i.test(file.name)) throw new Error("SOURCE_UNSAFE_DOCX");
    names.add(file.name); return file.name === "word/document.xml" || file.name === "[Content_Types].xml";
  } });
  if (!files["word/document.xml"] || !files["[Content_Types].xml"]) throw new Error("SOURCE_INVALID_DOCX");
  const xml = strFromU8(files["word/document.xml"]), types = strFromU8(files["[Content_Types].xml"]);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml + types) || /macroEnabled|vbaProject/i.test(types)) throw new Error("SOURCE_UNSAFE_DOCX");
  if (!/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/.test(types) || !/<(?:w:)?document\b/.test(xml)) throw new Error("SOURCE_INVALID_DOCX");
  const text = [...xml.replace(/<\/w:p>/g, "\n").matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|(\n)/g)].map(match => match[2] ? "\n" : decodeXmlText(match[1])).join("");
  if (text.length > maxText) throw new Error("SOURCE_EXTRACTED_TEXT_TOO_LARGE");
  return text;
}
export async function extractPdfText(data: Uint8Array): Promise<string> {
  if (data.byteLength > maxInput || new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new Error("SOURCE_INVALID_PDF");
  // A parser crash, memory excess or pathological document cannot stall the web/core worker.
  const program = `
    const chunks=[]; for await(const chunk of process.stdin)chunks.push(chunk);
    const bytes=Buffer.concat(chunks); if(bytes.length>2097152)process.exit(2);
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task=getDocument({data:Uint8Array.from(bytes),isEvalSupported:false,useWorkerFetch:false,useSystemFonts:false,disableFontFace:true,maxImageSize:0,verbosity:0});
    try {const pdf=await task.promise;if(pdf.numPages>100)throw Error('PAGES');let text='';
      for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number),content=await page.getTextContent();text+=content.items.map(item=>'str'in item?item.str:'').join(' ')+'\\n';page.cleanup();if(text.length>200000)throw Error('TEXT');}
      process.stdout.write(JSON.stringify({text}));
    }catch{process.exitCode=2;}finally{await task.destroy();}
  `;
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, ["--max-old-space-size=128", "--input-type=module", "-e", program], { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = []; let size = 0, settled = false;
    const fail = () => { if (settled) return; settled = true; child.kill("SIGKILL"); clearTimeout(timer); reject(new Error("SOURCE_PDF_EXTRACTION_FAILED")); };
    const timer = setTimeout(fail, 15_000); timer.unref();
    child.stdout.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 1024 * 1024) fail(); else chunks.push(chunk); });
    child.stderr.resume(); child.on("error", fail); child.stdin.on("error", fail);
    child.on("close", code => {
      if (settled) return;
      if (code !== 0) { fail(); return; }
      try { const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!result || typeof result !== "object" || !("text" in result) || typeof result.text !== "string" || result.text.length > maxText) { fail(); return; } settled = true; clearTimeout(timer); resolve(result.text); }
      catch { fail(); }
    });
    child.stdin.end(Buffer.from(data));
  });
}

export function detectSourceDocumentMime(data: Uint8Array): "application/pdf" | "application/vnd.openxmlformats-officedocument.wordprocessingml.document" | null {
  if (new TextDecoder().decode(data.slice(0, 5)) === "%PDF-") return "application/pdf";
  if (data[0] === 0x50 && data[1] === 0x4b) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null;
}
