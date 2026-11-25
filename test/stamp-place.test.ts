import { describe, expect, it } from "vitest";
import { localToUser, placeStamp, userToVisual, type QuarterTurn } from "../src/pdf/stamp";

const turns: QuarterTurn[] = [0, 90, 180, 270];

describe("Stempelposition", () => {
  it("sitzt aufrecht oben rechts, mit Abstand zum Seitenrand", () => {
    const pageWidth = 595;
    const pageHeight = 842;
    const stampWidth = 46;
    const stampHeight = 20;
    const margin = 14;
    for (const rotation of turns) {
      const placement = placeStamp(pageWidth, pageHeight, rotation, stampWidth, stampHeight, margin);
      const corners = [
        [0, 0],
        [stampWidth, 0],
        [stampWidth, stampHeight],
        [0, stampHeight],
      ].map(([localX, localY]) => localToUser(placement.x, placement.y, localX, localY, placement.rotate));
      const visual = corners.map((point) => userToVisual(point.x, point.y, pageWidth, pageHeight, rotation));
      const minX = Math.min(...visual.map((point) => point.x));
      const maxX = Math.max(...visual.map((point) => point.x));
      const minY = Math.min(...visual.map((point) => point.y));
      const maxY = Math.max(...visual.map((point) => point.y));
      expect(maxX, `rechts ${rotation}`).toBeCloseTo(visual[0].visualWidth - margin, 5);
      expect(minY, `oben ${rotation}`).toBeCloseTo(margin, 5);
      expect(maxX - minX, `breite ${rotation}`).toBeCloseTo(stampWidth, 5);
      expect(maxY - minY, `höhe ${rotation}`).toBeCloseTo(stampHeight, 5);
      for (const point of corners) {
        expect(point.x).toBeGreaterThanOrEqual(-0.01);
        expect(point.y).toBeGreaterThanOrEqual(-0.01);
        expect(point.x).toBeLessThanOrEqual(pageWidth + 0.01);
        expect(point.y).toBeLessThanOrEqual(pageHeight + 0.01);
      }
    }
  });

  it("rückt den Stempel auf einer kleinen Seite vom Rand weg, ohne die Seite zu verlassen", () => {
    const placement = placeStamp(40, 30, 0, 24, 16, 14);
    expect(placement.x).toBeGreaterThanOrEqual(0);
    expect(placement.y).toBeGreaterThanOrEqual(0);
    expect(placement.x + 24).toBeLessThanOrEqual(40);
    expect(placement.y + 16).toBeLessThanOrEqual(30);
  });
});
