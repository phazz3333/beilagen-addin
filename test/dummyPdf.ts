import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export async function buildDarkPdf(rotation: 0 | 90 | 180 | 270, pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pages; index += 1) {
    const page = doc.addPage([595, 842]);
    page.setRotation(degrees(rotation));
    page.drawRectangle({ x: 0, y: 0, width: 595, height: 842, color: rgb(0.08, 0.11, 0.16) });
    page.drawText(index === 0 ? "MUSTER" : "SEITE2", {
      x: 48,
      y: 420,
      size: 18,
      font,
      color: rgb(0.75, 0.78, 0.82),
    });
  }
  return doc.save();
}

/** Helles Schreiben mit dunklem Briefkopf, damit der weisse Stempel sichtbar ist. */
export async function buildLetterheadPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({
    x: 0,
    y: 760,
    width: 595.28,
    height: 82,
    color: rgb(0.08, 0.12, 0.2),
  });
  page.drawText("MUSTERDOKUMENT", { x: 56, y: 700, size: 18, font: bold, color: rgb(0.12, 0.12, 0.14) });
  page.drawText("Keine Mandantendaten. Nur zur Demonstration des Stempels.", {
    x: 56,
    y: 676,
    size: 11,
    font,
    color: rgb(0.32, 0.32, 0.35),
  });
  page.drawText("Kaufvertrag zwischen Muster AG und Beispiel GmbH.", {
    x: 56,
    y: 620,
    size: 12,
    font,
    color: rgb(0.15, 0.15, 0.16),
  });
  page.drawText("Seite 1", { x: 56, y: 72, size: 10, font, color: rgb(0.4, 0.4, 0.42) });
  return doc.save();
}
