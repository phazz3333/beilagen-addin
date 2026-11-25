import type { Exhibit } from "./types";

export interface RenumberResult {
  exhibits: Exhibit[];
  numbers: Map<string, number>;
  orphans: Exhibit[];
  /** Verweise im Dokument, zu denen kein Eintrag mehr existiert. */
  unknownIds: string[];
}

/**
 * Nummern folgen der ersten Nennung. Weitere Verweise auf dieselbe Beilage
 * behalten diese Nummer. Einträge ohne Verweis bleiben erhalten, mit Nummer 0.
 * Die Eingabe wird nicht verändert.
 */
export function renumberExhibits(
  exhibits: readonly Exhibit[],
  mentionOrder: readonly string[],
): RenumberResult {
  const byId = new Map(exhibits.map((exhibit) => [exhibit.id.toLowerCase(), exhibit]));
  const seen = new Set<string>();
  const numbers = new Map<string, number>();
  const numbered: Exhibit[] = [];
  const unknownIds: string[] = [];
  let next = 1;

  for (const rawId of mentionOrder) {
    const id = rawId.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    const exhibit = byId.get(id);
    if (!exhibit) {
      unknownIds.push(id);
      continue;
    }
    numbers.set(id, next);
    numbered.push({ ...exhibit, id, number: next });
    next += 1;
  }

  const orphans = exhibits
    .filter((exhibit) => !numbers.has(exhibit.id.toLowerCase()))
    .map((exhibit) => ({ ...exhibit, id: exhibit.id.toLowerCase(), number: 0 }));

  return {
    exhibits: [...numbered, ...orphans],
    numbers,
    orphans,
    unknownIds,
  };
}
