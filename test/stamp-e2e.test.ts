import { mkdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { exhibitFileName } from "../src/domain/filenames";
import { createExhibitPackage } from "../src/pdf/packageZip";
import { stampFirstPage } from "../src/pdf/stamp";
import type { BeilagenState } from "../src/domain/types";
import { buildDarkPdf, buildLetterheadPdf } from "./dummyPdf";
import { extractPdfText, hasCommand, pageContent, pdfPageText, renderPdfPage, renderPdfPng, type Raster } from "./pdfTools";

const poppler = hasCommand("pdftoppm") && hasCommand("pdftotext");

describe("PDF-Stempel", () => {
  it("stempelt nur die erste Seite und lässt die zweite unberührt", async () => {
    const source = await buildDarkPdf(0, 2);
    const stamped = await stampFirstPage(source, "KB 1");
    const first = await pageContent(stamped, 0);
    const second = await pageContent(stamped, 1);
    expect(extractPdfText(first)).toContain("KB 1");
    expect(first).toContain("1 1 1 rg");
    expect(extractPdfText(second)).not.toContain("KB 1");
    expect(extractPdfText(second)).toContain("SEITE2");
    if (poppler) {
      expect(pdfPageText(stamped, 1)).toContain("KB 1");
      expect(pdfPageText(stamped, 2)).toContain("SEITE2");
      expect(pdfPageText(stamped, 2)).not.toContain("KB 1");
    }
  });

  it.each([0, 90, 180, 270] as const)("liegt bei Drehung %s° oben rechts auf dem weissen Feld", async (rotation) => {
    if (!poppler) return;
    const stamped = await stampFirstPage(await buildDarkPdf(rotation), "KB 1");
    const image = renderPdfPage(stamped, 1, 72);
    const box = whiteBox(image);
    expect(box, "weisses Feld").not.toBeNull();
    const found = box!;
    expect(found.minY).toBeGreaterThanOrEqual(6);
    expect(found.minY).toBeLessThanOrEqual(28);
    expect(image.width - found.maxX).toBeGreaterThanOrEqual(6);
    expect(image.width - found.maxX).toBeLessThanOrEqual(28);
    expect(found.maxX - found.minX).toBeGreaterThan(24);
    expect(found.maxY - found.minY).toBeGreaterThan(10);
    expect(found.maxY).toBeLessThan(image.height * 0.25);
    expect(countNavy(image, found)).toBeGreaterThan(8);
    const outside = pixel(image, Math.max(0, found.minX - 8), Math.round((found.minY + found.maxY) / 2));
    expect(outside.r).toBeLessThan(60);
    expect(outside.b).toBeLessThan(90);
  });

  it("packt gestempelte Dummy-PDFs und das Verzeichnis", async () => {
    const state: BeilagenState = {
      version: 1,
      revision: 1,
      savedAt: "",
      abbreviation: "KB",
      exhibits: [
        { id: "22222222-2222-4222-8222-222222222222", title: "Schreiben Müller", date: "2024-04-02", number: 2 },
        { id: "11111111-1111-4111-8111-111111111111", title: "Kaufvertrag", date: "2024-03-12", number: 1 },
      ],
    };
    const files = new Map<string, Uint8Array>([
      [state.exhibits[0].id, await buildDarkPdf(0, 2)],
      [state.exhibits[1].id, await buildDarkPdf(0, 1)],
    ]);
    const packed = await createExhibitPackage(state, files);
    expect(packed.fileName).toBe("Beilagen-KB.zip");
    expect(packed.entries).toEqual([
      "00 Beweismittelverzeichnis.pdf",
      exhibitFileName("KB", 1, "Kaufvertrag"),
      exhibitFileName("KB", 2, "Schreiben Müller"),
    ]);
    const zip = await JSZip.loadAsync(packed.bytes);
    expect(Object.keys(zip.files).sort()).toEqual([...packed.entries].sort());
    const first = await zip.file(exhibitFileName("KB", 1, "Kaufvertrag"))!.async("uint8array");
    expect(extractPdfText(await pageContent(first, 0))).toContain("KB 1");
    const directory = await zip.file("00 Beweismittelverzeichnis.pdf")!.async("uint8array");
    const directoryText = extractPdfText(await pageContent(directory, 0));
    expect(directoryText).toContain("Beweismittelverzeichnis");
    expect(directoryText).toContain("Kaufvertrag");
    expect(directoryText).toContain("Schreiben Müller");
    expect(directoryText).toContain("12.03.2024");
    if (poppler) {
      const text = pdfPageText(directory, 1);
      expect(text).toContain("Schreiben Müller");
      expect(text).toContain("12.03.2024");
    }

    await expect(createExhibitPackage(state, new Map())).rejects.toThrow(/noch kein PDF/);
  });

  it("schreibt das Musterbild des gestempelten PDFs", async () => {
    if (!poppler || process.env.WRITE_SAMPLES !== "1") return;
    const stamped = await stampFirstPage(await buildLetterheadPdf(), "KB 1");
    mkdirSync("docs/bilder", { recursive: true });
    renderPdfPng(stamped, "docs/bilder/stempel-muster.png", 140);
    expect(extractPdfText(await pageContent(stamped, 0))).toContain("KB 1");
  });
});

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function whiteBox(image: Raster): Box | null {
  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const sample = pixel(image, x, y);
      if (sample.r < 248 || sample.g < 248 || sample.b < 248) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return found ? { minX, minY, maxX, maxY } : null;
}

function countNavy(image: Raster, box: Box): number {
  let count = 0;
  for (let y = box.minY; y <= box.maxY; y += 1) {
    for (let x = box.minX; x <= box.maxX; x += 1) {
      const sample = pixel(image, x, y);
      if (sample.b > sample.r + 15 && sample.r < 100 && sample.b > 50) count += 1;
    }
  }
  return count;
}

function pixel(image: Raster, x: number, y: number): { r: number; g: number; b: number } {
  const index = (y * image.width + x) * 3;
  return { r: image.data[index], g: image.data[index + 1], b: image.data[index + 2] };
}
