import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFRef, type PDFObject } from "pdf-lib";

export function hasCommand(command: string): boolean {
  try {
    execFileSync(command, ["-v"], { stdio: "ignore" });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ENOENT";
  }
}

export function pdfPageText(pdf: Uint8Array, page: number): string {
  const dir = mkdtempSync(join(tmpdir(), "beilagen-"));
  const input = join(dir, "in.pdf");
  writeFileSync(input, pdf);
  return execFileSync("pdftotext", ["-f", String(page), "-l", String(page), "-layout", input, "-"], {
    encoding: "utf8",
  });
}

export interface Raster {
  width: number;
  height: number;
  data: Buffer;
}

export function renderPdfPage(pdf: Uint8Array, page = 1, dpi = 72): Raster {
  const dir = mkdtempSync(join(tmpdir(), "beilagen-"));
  const input = join(dir, "in.pdf");
  const output = join(dir, "out");
  writeFileSync(input, pdf);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", String(page), "-l", String(page), "-singlefile", input, output]);
  return parsePpm(readFileSync(`${output}.ppm`));
}

export function renderPdfPng(pdf: Uint8Array, destination: string, dpi = 130): void {
  const dir = mkdtempSync(join(tmpdir(), "beilagen-"));
  const input = join(dir, "in.pdf");
  const output = join(dir, "out");
  writeFileSync(input, pdf);
  execFileSync("pdftoppm", ["-png", "-r", String(dpi), "-f", "1", "-l", "1", "-singlefile", input, output]);
  writeFileSync(destination, readFileSync(`${output}.png`));
}

/** Liest Textoperatoren aus einem Inhaltsstrom, inklusive hexadezimaler WinAnsi-Strings. */
export function extractPdfText(content: string): string {
  let text = "";
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const raw = match[1].replace(/\s+/g, "");
    if (raw.length < 2 || raw.length % 2 !== 0) continue;
    for (let index = 0; index < raw.length; index += 2) {
      text += String.fromCharCode(Number.parseInt(raw.slice(index, index + 2), 16));
    }
    text += "\n";
  }
  for (const match of content.matchAll(/\(((?:\\.|[^\\)])*)\)/g)) {
    text += match[1].replace(/\\([nrtbf()\\])/g, (_full, char: string) => {
      if (char === "n") return "\n";
      if (char === "r") return "\r";
      if (char === "t") return "\t";
      return char;
    });
    text += "\n";
  }
  return text;
}

export async function pageContent(pdf: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(pdf);
  const page = doc.getPage(pageIndex);
  return collect(doc, page.node.Contents());
}

function collect(doc: PDFDocument, value: PDFObject | undefined): string {
  if (!value) return "";
  const resolved = value instanceof PDFRef ? doc.context.lookup(value) : value;
  if (resolved instanceof PDFArray) {
    return resolved.asArray().map((item) => collect(doc, item)).join("\n");
  }
  if (resolved instanceof PDFRawStream) {
    let data: Buffer = Buffer.from(resolved.contents);
    const filter = resolved.dict.get(PDFName.of("Filter"));
    const names = filter instanceof PDFArray ? filter.asArray() : filter ? [filter] : [];
    for (const name of names) {
      const resolvedName = name instanceof PDFRef ? doc.context.lookup(name) : name;
      if (resolvedName === PDFName.FlateDecode) data = Buffer.from(inflateSync(data));
    }
    return data.toString("latin1");
  }
  return "";
}

function parsePpm(buf: Buffer): Raster {
  if (buf.subarray(0, 2).toString() !== "P6") throw new Error("Kein PPM.");
  let index = 2;
  const tokens: string[] = [];
  while (tokens.length < 3) {
    while (index < buf.length && buf[index] <= 32) index += 1;
    if (buf[index] === 35) {
      while (index < buf.length && buf[index] !== 10) index += 1;
      continue;
    }
    const start = index;
    while (index < buf.length && buf[index] > 32) index += 1;
    tokens.push(buf.subarray(start, index).toString("ascii"));
  }
  if (index < buf.length && buf[index] <= 32) index += 1;
  const width = Number(tokens[0]);
  const height = Number(tokens[1]);
  const data = buf.subarray(index);
  if (data.length < width * height * 3) throw new Error("PPM ist unvollständig.");
  return { width, height, data };
}
