import type { BeilagenState } from "../domain/types";

export const MUSTER_IDS = {
  vertrag: "11111111-1111-4111-8111-111111111111",
  schreiben: "22222222-2222-4222-8222-222222222222",
  konto: "33333333-3333-4333-8333-333333333333",
} as const;

export function musterState(): BeilagenState {
  return {
    version: 1,
    revision: 1,
    savedAt: "",
    abbreviation: "KB",
    citationOrder: "number-first",
    exhibits: [
      { id: MUSTER_IDS.vertrag, title: "Kaufvertrag Muster", number: 1 },
      { id: MUSTER_IDS.schreiben, title: "Schreiben Gegenseite Muster", number: 2 },
      { id: MUSTER_IDS.konto, title: "Kontoauszug Muster", number: 3 },
    ],
  };
}
