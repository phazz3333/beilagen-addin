import { describe, expect, it } from "vitest";
import { exhibitFileName, packageZipName, sanitizeFileStem } from "../src/domain/filenames";
import { stampLabel } from "../src/domain/labels";
import { matchPdfFiles } from "../src/domain/matchPdfs";
import type { Exhibit } from "../src/domain/types";

const exhibits: Exhibit[] = [
  { id: "11111111-1111-4111-8111-111111111111", title: "Kaufvertrag", date: "", number: 1 },
  { id: "22222222-2222-4222-8222-222222222222", title: "Schreiben", date: "", number: 2 },
];

describe("Dateinamen", () => {
  it("baut KB 01 - Bezeichnung.pdf", () => {
    expect(exhibitFileName("KB", 1, "Kaufvertrag")).toBe("KB 01 - Kaufvertrag.pdf");
    expect(exhibitFileName("AB", 12, "Protokoll")).toBe("AB 12 - Protokoll.pdf");
    expect(packageZipName("RB")).toBe("Beilagen-RB.zip");
    expect(stampLabel("DB", 4)).toBe("DB 4");
  });

  it("entfernt Zeichen, die Windows im Dateinamen verbietet", () => {
    expect(sanitizeFileStem('Vertrag: Müller/Zürich?')).toBe("Vertrag Müller Zürich");
    expect(exhibitFileName("KB", 3, "a/b\\c:d*e?")).toBe("KB 03 - a b c d e.pdf");
  });

  it("kürzt lange Bezeichnungen und ersetzt leere Titel", () => {
    expect(sanitizeFileStem("   ")).toBe("Beilage");
    expect([...sanitizeFileStem("ä".repeat(120))].length).toBe(80);
    expect(sanitizeFileStem("...")).toBe("Beilage");
  });

  it("ordnet Dateien über Kürzel und Nummer zu", () => {
    const result = matchPdfFiles(
      ["KB 01 - Kaufvertrag.pdf", "kb-02_schreiben.PDF", "Notiz.pdf", "KB 01 - doppelt.pdf", "AB 01 - andere.pdf"],
      "KB",
      exhibits,
    );
    expect(result.matches).toEqual([
      { exhibitId: exhibits[0].id, fileName: "KB 01 - Kaufvertrag.pdf" },
      { exhibitId: exhibits[1].id, fileName: "kb-02_schreiben.PDF" },
    ]);
    expect(result.unmatched).toEqual(["Notiz.pdf", "KB 01 - doppelt.pdf", "AB 01 - andere.pdf"]);
  });
});
