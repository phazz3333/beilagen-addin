import { describe, expect, it } from "vitest";
import { reapplicableFont } from "../src/domain/fontStyle";
import { buildCitation, normalizeLabel, planCitationUpdate } from "../src/domain/labels";
import { parseState, serializeState } from "../src/domain/storage";
import { sanitizePrefix, type BeilagenState } from "../src/domain/types";

const base: BeilagenState = {
  version: 1,
  revision: 1,
  savedAt: "2026-03-01T08:30:00.000Z",
  abbreviation: "BV",
  citationOrder: "description-first",
  exhibits: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Kaufvertrag vom 3. März 2025",
      number: 1,
    },
  ],
};

describe("Verweistext", () => {
  it("setzt die Nummer standardmässig links neben die Bezeichnung", () => {
    const citation = buildCitation("KB", 1, "Kaufvertrag vom 3. März 2025", "number-first");
    expect(citation.numberText).toBe("KB\u00A01");
    expect(citation.description).toBe("Kaufvertrag vom 3. März 2025");
    expect(normalizeLabel(citation.plain)).toBe("KB 1 Kaufvertrag vom 3. März 2025");
  });

  it("setzt die Nummer in Klammern hinter die Bezeichnung", () => {
    const citation = buildCitation("AB", 2, "Schreiben", "description-first");
    expect(normalizeLabel(citation.plain)).toBe("Schreiben (AB 2)");
  });

  it("erlaubt ein eigenes Kürzel und speichert die Reihenfolge", () => {
    expect(sanitizePrefix(" bv ")).toBe("bv");
    expect(sanitizePrefix("A/B")).toBeNull();
    expect(sanitizePrefix("Beilage-1")).toBe("Beilage-1");
    expect(parseState(serializeState(base))).toMatchObject({
      abbreviation: "BV",
      citationOrder: "description-first",
    });
    const legacy = serializeState({ ...base, citationOrder: "number-first" }).replace(' folge="nummer"', "");
    expect(parseState(legacy).citationOrder).toBe("number-first");
  });

  it("ändert beim Nummerieren nur die Nummer und behält die Bezeichnung", () => {
    const desired = buildCitation("KB", 3, "Kaufvertrag vom 3. März 2025", "number-first");
    expect(
      planCitationUpdate({
        hasNumberControl: true,
        hasDescriptionControl: true,
        currentOrder: "number-first",
        desired,
        currentNumberText: "KB 1",
        currentDescription: desired.description,
      }),
    ).toEqual({ rebuild: false, updateNumber: true, updateDescription: false });
  });

  it("baut den Verweis neu, wenn die Reihenfolge wechselt, ohne das äussere Steuerelement zu entfernen", () => {
    const desired = buildCitation("KB", 1, "Kaufvertrag vom 3. März 2025", "description-first");
    const plan = planCitationUpdate({
      hasNumberControl: true,
      hasDescriptionControl: true,
      currentOrder: "number-first",
      desired,
      currentNumberText: "KB 1",
      currentDescription: desired.description,
    });
    expect(plan.rebuild).toBe(true);
    expect(plan).not.toHaveProperty("deleteOuter");
  });

  it("übernimmt nur einheitliche Zeichenformatierung", () => {
    expect(
      reapplicableFont({
        bold: true,
        italic: null,
        name: "Times New Roman",
        size: 12,
        color: "#1C3A5F",
        underline: null,
      }),
    ).toEqual({
      bold: true,
      name: "Times New Roman",
      size: 12,
      color: "#1C3A5F",
    });
  });
});
