import { EncryptedPDFError, PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export const STAMP_MARGIN = 14;
export const STAMP_FONT_SIZE = 12;
export const STAMP_PAD_X = 8;
export const STAMP_PAD_Y = 4.5;
export const STAMP_NAVY = rgb(28 / 255, 58 / 255, 95 / 255);

export type QuarterTurn = 0 | 90 | 180 | 270;

export interface StampPlacement {
  x: number;
  y: number;
  rotate: QuarterTurn;
}

export function normalizeRotation(angle: number): QuarterTurn {
  const normalized = ((Math.round(angle) % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) return normalized;
  return 0;
}

function clampMargin(margin: number, visualExtent: number, stampExtent: number): number {
  const room = visualExtent - stampExtent;
  if (room <= 0) return 0;
  return Math.min(Math.max(margin, 0), room / 2);
}

/**
 * Position des Stempels in Benutzerkoordinaten der Seite (Ursprung unten links).
 * `rotate` ist gegen den Uhrzeigersinn, passend zu pdf-lib, damit der Stempel
 * nach der Seitendrehung aufrecht oben rechts steht.
 */
export function placeStamp(
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
  stampWidth: number,
  stampHeight: number,
  margin: number,
): StampPlacement {
  const rotate = normalizeRotation(pageRotation);
  const visualWidth = rotate === 90 || rotate === 270 ? pageHeight : pageWidth;
  const visualHeight = rotate === 90 || rotate === 270 ? pageWidth : pageHeight;
  const mRight = clampMargin(margin, visualWidth, stampWidth);
  const mTop = clampMargin(margin, visualHeight, stampHeight);
  const bw = stampWidth;
  const bh = stampHeight;

  switch (rotate) {
    case 0:
      return { x: pageWidth - mRight - bw, y: pageHeight - mTop - bh, rotate };
    case 90:
      return { x: mTop + bh, y: pageHeight - mRight - bw, rotate };
    case 180:
      return { x: mRight + bw, y: mTop + bh, rotate };
    case 270:
      return { x: pageWidth - mTop - bh, y: mRight + bw, rotate };
  }
}

export function localToUser(
  originX: number,
  originY: number,
  localX: number,
  localY: number,
  rotate: number,
): { x: number; y: number } {
  const rad = (rotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: originX + localX * cos - localY * sin,
    y: originY + localX * sin + localY * cos,
  };
}

/** Sichtbare Koordinaten, Ursprung oben links, y nach unten. Seite beginnt bei 0,0. */
export function userToVisual(
  userX: number,
  userY: number,
  pageWidth: number,
  pageHeight: number,
  pageRotation: number,
): { x: number; y: number; visualWidth: number; visualHeight: number } {
  const rotation = normalizeRotation(pageRotation);
  switch (rotation) {
    case 0:
      return { x: userX, y: pageHeight - userY, visualWidth: pageWidth, visualHeight: pageHeight };
    case 90:
      return { x: userY, y: userX, visualWidth: pageHeight, visualHeight: pageWidth };
    case 180:
      return { x: pageWidth - userX, y: userY, visualWidth: pageWidth, visualHeight: pageHeight };
    case 270:
      return {
        x: pageHeight - userY,
        y: pageWidth - userX,
        visualWidth: pageHeight,
        visualHeight: pageWidth,
      };
  }
}

export function describePdfError(error: unknown, fileName: string): string {
  if (error instanceof EncryptedPDFError || /encrypt/i.test(errorText(error))) {
    return `«${fileName}» ist verschlüsselt und kann nicht gestempelt werden.`;
  }
  if (error instanceof Error && /^(Die Datei|Das PDF|«)/.test(error.message)) {
    return error.message;
  }
  if (/keine Seite/.test(errorText(error))) {
    return `«${fileName}» enthält keine Seite.`;
  }
  return `«${fileName}» konnte nicht gestempelt werden.`;
}

export async function stampFirstPage(pdfBytes: Uint8Array, label: string): Promise<Uint8Array> {
  const text = label.trim();
  if (!text) throw new Error("Der Stempel hat keinen Text.");
  assertPdfBytes(pdfBytes);

  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  } catch (error) {
    if (error instanceof EncryptedPDFError || /encrypt/i.test(errorText(error))) {
      throw new EncryptedPDFError();
    }
    throw new Error("Die Datei ist kein lesbares PDF.");
  }

  if (doc.getPageCount() < 1) throw new Error("Das PDF enthält keine Seite.");
  const page = doc.getPage(0);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = STAMP_FONT_SIZE;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  const fullHeight = font.heightAtSize(fontSize, { descender: true });
  const aboveBaseline = font.heightAtSize(fontSize, { descender: false });
  const descender = Math.max(0, fullHeight - aboveBaseline);
  const boxW = textWidth + STAMP_PAD_X * 2;
  const boxH = fullHeight + STAMP_PAD_Y * 2;
  const baseline = STAMP_PAD_Y + descender;

  const crop = page.getCropBox();
  const rotation = page.getRotation().angle;
  const placement = placeStamp(crop.width, crop.height, rotation, boxW, boxH, STAMP_MARGIN);
  const originX = crop.x + placement.x;
  const originY = crop.y + placement.y;

  page.drawRectangle({
    x: originX,
    y: originY,
    width: boxW,
    height: boxH,
    rotate: degrees(placement.rotate),
    color: rgb(1, 1, 1),
    borderColor: STAMP_NAVY,
    borderWidth: 0.9,
  });

  const textAt = localToUser(originX, originY, STAMP_PAD_X, baseline, placement.rotate);
  page.drawText(text, {
    x: textAt.x,
    y: textAt.y,
    size: fontSize,
    font,
    color: STAMP_NAVY,
    rotate: degrees(placement.rotate),
  });

  doc.setProducer("Balthasar Legal Beilagen");
  return doc.save({ useObjectStreams: false });
}

export function assertPdfBytes(pdfBytes: Uint8Array): void {
  const window = pdfBytes.subarray(0, Math.min(pdfBytes.length, 1024));
  const asText = new TextDecoder("latin1").decode(window);
  if (!asText.includes("%PDF-")) {
    throw new Error("Die Datei ist kein PDF.");
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
