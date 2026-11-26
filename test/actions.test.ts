import { describe, expect, it } from "vitest";
import { MemoryHost } from "../src/office/memoryHost";
import {
  changeAbbreviation,
  insertExistingExhibit,
  insertNewExhibit,
  placeDirectory,
  removeExhibit,
  renumberDocument,
} from "../src/taskpane/actions";

describe("Ablauf ohne Word", () => {
  it("vergibt Nummern nach der ersten Nennung und zieht sie beim Verschieben nach", async () => {
    const host = new MemoryHost();
    let state = (await changeAbbreviation(host, await host.load(), "KB")).state;

    state = (await insertNewExhibit(host, state, { title: "Kaufvertrag" })).state;
    state = (await insertNewExhibit(host, state, { title: "Schreiben" })).state;
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
    expect(orphaned.state.exhibits.map((item) => item.id)).toEqual([schreiben.id]);
    expect(orphaned.status).toMatch(/ohne Verweis entfernt/);
    expect(host.lastDirectoryHtml).not.toContain("Kaufvertrag");

    const renamed = await changeAbbreviation(host, orphaned.state, "AB");
    expect(renamed.state.abbreviation).toBe("AB");
    expect(host.lastDirectoryHtml).toContain("AB 1");
    expect(renamed.state.exhibits.find((item) => item.id === schreiben.id)?.number).toBe(1);
  });

  it("entfernt eine Beilage und nummeriert die übrigen lückenlos", async () => {
    const host = new MemoryHost();
    let state = (await changeAbbreviation(host, await host.load(), "KB")).state;
    state = (await insertNewExhibit(host, state, { title: "Kaufvertrag" })).state;
    state = (await insertNewExhibit(host, state, { title: "Schreiben" })).state;
    const kauf = state.exhibits.find((item) => item.title === "Kaufvertrag")!;
    await placeDirectory(host, state);
    const removed = await removeExhibit(host, state, kauf.id);
    expect(removed.state.exhibits.map((item) => [item.title, item.number])).toEqual([["Schreiben", 1]]);
    expect((await host.readMentions()).ids).not.toContain(kauf.id);
    expect(host.lastDirectoryHtml).toContain("KB 1");
    expect(host.lastDirectoryHtml).toContain("Schreiben");
    expect(host.lastDirectoryHtml).not.toContain("Kaufvertrag");
  });
});
