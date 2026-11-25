import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** Kleines Muster-PDF ohne Mandantendaten, nur für die Vorschau. */
export async function buildMinimalPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 82, color: rgb(28 / 255, 58 / 255, 95 / 255) });
  page.drawText("MUSTERDOKUMENT", {
    x: 56,
    y: 700,
    size: 16,
    font,
    color: rgb(0.12, 0.12, 0.13),
  });
  page.drawText("Keine Mandantendaten.", { x: 56, y: 676, size: 11, font, color: rgb(0.35, 0.35, 0.38) });
  return doc.save();
}
