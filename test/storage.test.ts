import { describe, expect, it } from "vitest";
import { parseState, serializeState } from "../src/domain/storage";
import { emptyState, type BeilagenState } from "../src/domain/types";

const state: BeilagenState = {
  version: 1,
  revision: 4,
  savedAt: "2026-03-01T08:30:00.000Z",
  abbreviation: "KB",
  exhibits: [
    { id: "11111111-1111-4111-8111-111111111111", title: "Kaufvertrag Müller & Söhne <Entwurf>", date: "2024-03-12", number: 1 },
    { id: "22222222-2222-4222-8222-222222222222", title: "Schreiben", date: "", number: 0 },
  ],
};

describe("Custom XML", () => {
  it("schreibt und liest den Stand unverändert", () => {
    expect(parseState(serializeState(state))).toEqual(state);
  });

  it("akzeptiert Namespace-Präfixe von Word", () => {
    const xml = serializeState(state).replaceAll("<Eintrag", "<b:Eintrag").replaceAll("</Eintrag>", "</b:Eintrag>");
    expect(parseState(xml).exhibits[0].title).toBe(state.exhibits[0].title);
  });

  it("lehnt eine neuere Speicherversion ab", () => {
    const xml = serializeState(state).replace('version="1"', 'version="2"');
    expect(() => parseState(xml)).toThrow(/neueren Version/);
  });

  it("verwirft ungültige Kürzel und Daten", () => {
    const xml = `<Beilagen xmlns="urn:balthasar-legal:beilagen:v1" version="1" revision="1" savedAt="">
      <Kuerzel>XY</Kuerzel>
      <Eintrag id="11111111-1111-4111-8111-111111111111" nummer="2" datum="2024-13-40"><Bezeichnung>Vertrag</Bezeichnung></Eintrag>
      <Eintrag id="kein-uuid" nummer="1"><Bezeichnung>Weg</Bezeichnung></Eintrag>
    </Beilagen>`;
    expect(parseState(xml)).toMatchObject({
      abbreviation: null,
      exhibits: [{ title: "Vertrag", date: "", number: 2 }],
    });
  });

  it("liefert für ein neues Dokument einen leeren Stand", () => {
    expect(emptyState().abbreviation).toBeNull();
    expect(() => parseState("<anders/>")).toThrow(/unlesbar/);
  });
});
