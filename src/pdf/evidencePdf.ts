import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DirectoryModel } from "../domain/directory";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const NAVY = rgb(28 / 255, 58 / 255, 95 / 255);
const INK = rgb(0.11, 0.11, 0.12);
const LINE = rgb(0.75, 0.75, 0.78);

export async function buildDirectoryPdf(model: DirectoryModel): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const ensure = (height: number) => {
    if (y - height >= MARGIN) return;
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const drawLine = (text: string, size: number, font: typeof bold, color = INK) => {
    ensure(size + 4);
    page.drawText(pdfSafe(text), { x: MARGIN, y: y - size, size, font, color });
    y -= size + 4;
  };

  drawLine(model.heading, 16, bold, NAVY);
  drawLine(model.kind, 11, regular, rgb(0.35, 0.35, 0.38));
  y -= 8;

  const columns = [MARGIN, MARGIN + 70, MARGIN + 360];
  const tableRight = PAGE_WIDTH - MARGIN;
  const rowFont = 10;

  const drawRow = (cells: [string, string, string], header: boolean) => {
    const font = header ? bold : regular;
    const wrapped = cells.map((cell, index) => {
      const width = (index === cells.length - 1 ? tableRight : columns[index + 1]) - columns[index] - 8;
      return wrap(pdfSafe(cell), font, rowFont, width);
    });
    const lines = Math.max(...wrapped.map((item) => item.length), 1);
    const rowHeight = lines * (rowFont + 3) + 8;
    ensure(rowHeight);
    const top = y;
    page.drawLine({
      start: { x: MARGIN, y: top },
      end: { x: tableRight, y: top },
      thickness: header ? 1 : 0.4,
      color: header ? NAVY : LINE,
    });
    wrapped.forEach((item, index) => {
      item.forEach((line, lineIndex) => {
        page.drawText(line, {
          x: columns[index],
          y: top - 6 - rowFont - lineIndex * (rowFont + 3),
          size: rowFont,
          font,
          color: INK,
        });
      });
    });
    y = top - rowHeight;
  };

  drawRow(["Nr.", "Bezeichnung", "Datum"], true);
  if (model.rows.length === 0) {
    drawRow(["–", "Keine Beilage", "–"], false);
  } else {
    for (const row of model.rows) {
      drawRow([row.label, row.title, row.date], false);
    }
  }
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: tableRight, y },
    thickness: 0.6,
    color: NAVY,
  });

  doc.setTitle(model.heading);
  doc.setProducer("Balthasar Legal Beilagen");
  return doc.save({ useObjectStreams: false });
}

function wrap(text: string, font: { widthOfTextAtSize(text: string, size: number): number }, size: number, maxWidth: number): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const pieces = breakLong(word, font, size, maxWidth);
    for (const piece of pieces) {
      const next = current ? `${current} ${piece}` : piece;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = piece;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function breakLong(
  word: string,
  font: { widthOfTextAtSize(text: string, size: number): number },
  size: number,
  maxWidth: number,
): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    const next = current + char;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) parts.push(current);
      current = char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/** Helvetica in pdf-lib spricht WinAnsi. Seltene Zeichen werden ersetzt. */
export function pdfSafe(text: string): string {
  const replaced = text
    .replaceAll("\u00A0", " ")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201C", '"')
    .replaceAll("\u201D", '"')
    .replaceAll("\u2026", "...")
    .replaceAll("–", "-");
  let result = "";
  for (const char of replaced) {
    const code = char.charCodeAt(0);
    const winAnsi = code <= 0x7f || (code >= 0xa0 && code <= 0xff);
    result += winAnsi ? char : "?";
  }
  return result;
}
