import { describe, expect, it } from "vitest";
import { renumberExhibits } from "../src/domain/numbering";
import type { Exhibit } from "../src/domain/types";

const a: Exhibit = { id: "11111111-1111-4111-8111-111111111111", title: "Kaufvertrag", number: 9 };
const b: Exhibit = { id: "22222222-2222-4222-8222-222222222222", title: "Schreiben", number: 2 };
const c: Exhibit = { id: "33333333-3333-4333-8333-333333333333", title: "Kontoauszug", number: 1 };

describe("renumberExhibits", () => {
  it("nummeriert nach der ersten Nennung", () => {
    const result = renumberExhibits([a, b, c], [c.id, a.id, b.id]);
    expect(result.exhibits.map((item) => [item.id, item.number])).toEqual([
      [c.id, 1],
      [a.id, 2],
      [b.id, 3],
    ]);
    expect(result.orphans).toEqual([]);
    expect(a.number).toBe(9);
  });

  it("behält bei mehreren Verweisen dieselbe Nummer", () => {
    const result = renumberExhibits([a, b], [b.id, a.id, b.id, a.id]);
    expect(result.numbers.get(b.id)).toBe(1);
    expect(result.numbers.get(a.id)).toBe(2);
    expect(result.exhibits).toHaveLength(2);
  });

  it("lässt Einträge ohne Verweis stehen, ohne Nummer", () => {
    const result = renumberExhibits([a, b], [a.id]);
    expect(result.exhibits[0]).toMatchObject({ id: a.id, number: 1, title: "Kaufvertrag" });
    expect(result.orphans).toEqual([{ ...b, number: 0 }]);
  });

  it("meldet Verweise ohne Eintrag und vergibt dafür keine Nummer", () => {
    const unknown = "44444444-4444-4444-8444-444444444444";
    const result = renumberExhibits([a], [unknown, a.id, unknown]);
    expect(result.unknownIds).toEqual([unknown]);
    expect(result.numbers.get(a.id)).toBe(1);
  });

  it("beginnt bei einem leeren Dokument bei null", () => {
    expect(renumberExhibits([], []).exhibits).toEqual([]);
  });
});
