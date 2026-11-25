import { describe, expect, it } from "vitest";
import { MemoryHost } from "../src/office/memoryHost";
import {
  changeAbbreviation,
  insertExistingExhibit,
  insertNewExhibit,
  placeDirectory,
  renumberDocument,
} from "../src/taskpane/actions";

describe("Ablauf ohne Word", () => {
  it("vergibt Nummern nach der ersten Nennung und zieht sie beim Verschieben nach", async () => {
    const host = new MemoryHost();
    let state = (await changeAbbreviation(host, await host.load(), "KB")).state;

    state = (await insertNewExhibit(host, state, { title: "Kaufvertrag", date: "2024-03-12" })).state;
    state = (await insertNewExhibit(host, state, { title: "Schreiben", date: "" })).state;
    const kauf = state.exhibits.find((item) => item.title === "Kaufvertrag")!;
    const schreiben = state.exhibits.find((item) => item.title === "Schreiben")!;
    expect(kauf.number).toBe(1);
    expect(schreiben.number).toBe(2);

    state = (await insertExistingExhibit(host, state, kauf.id)).state;
    expect(state.exhibits).toHaveLength(2);
    expect(state.exhibits.find((item) => item.id === kauf.id)?.number).toBe(1);

    host.replaceMentions([schreiben.id, kauf.id, kauf.id]);
    const renumbered = await renumberDocument(host, state);
    expect(renumbered.state.exhibits.map((item) => item.title)).toEqual(["Schreiben", "Kaufvertrag"]);
    expect(renumbered.state.exhibits.map((item) => item.number)).toEqual([1, 2]);

    const placed = await placeDirectory(host, renumbered.state);
    expect(placed.status).toMatch(/erstellt/);
    expect(host.lastDirectoryHtml).toContain("KB 1");
    expect(host.lastDirectoryHtml.indexOf("Schreiben")).toBeLessThan(host.lastDirectoryHtml.indexOf("Kaufvertrag"));

    host.replaceMentions([schreiben.id]);
    const orphaned = await renumberDocument(host, renumbered.state);
    const left = orphaned.state.exhibits.find((item) => item.id === kauf.id)!;
    expect(left.number).toBe(0);
    expect(host.lastDirectoryHtml).not.toContain("Kaufvertrag");

    const renamed = await changeAbbreviation(host, orphaned.state, "AB");
    expect(renamed.state.abbreviation).toBe("AB");
    expect(host.lastDirectoryHtml).toContain("AB 1");
    expect(renamed.state.exhibits.find((item) => item.id === schreiben.id)?.number).toBe(1);
  });
});
