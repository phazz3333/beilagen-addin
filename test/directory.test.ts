import { describe, expect, it } from "vitest";
import { directoryModel, renderDirectoryHtml, renderDirectoryPlain } from "../src/domain/directory";
import type { BeilagenState } from "../src/domain/types";

const state: BeilagenState = {
  version: 1,
  revision: 1,
  savedAt: "",
  abbreviation: "KB",
  citationOrder: "number-first",
  exhibits: [
    { id: "22222222-2222-4222-8222-222222222222", title: "Schreiben <intern>", number: 2 },
    { id: "11111111-1111-4111-8111-111111111111", title: "Kaufvertrag", number: 1 },
    { id: "33333333-3333-4333-8333-333333333333", title: "Ohne Verweis", number: 0 },
  ],
};

describe("Beweismittelverzeichnis", () => {
  it("ordnet nummerierte Beilagen nach Nummer und Bezeichnung", () => {
    const model = directoryModel(state);
    expect(model.rows.map((row) => row.label)).toEqual(["KB 1", "KB 2"]);
    expect(model.rows.map((row) => row.title)).toEqual(["Kaufvertrag", "Schreiben <intern>"]);
    const html = renderDirectoryHtml(model);
    expect(html).toContain("Beweismittelverzeichnis");
    expect(html).toContain("Kaufvertrag");
    expect(html).toContain("&lt;intern&gt;");
    expect(html).not.toContain("<intern>");
    expect(renderDirectoryPlain(model).split("\n")[3]).toBe("KB 1\tKaufvertrag");
    expect(html).not.toContain("Datum");
  });
});
