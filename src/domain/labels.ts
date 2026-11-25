import type { Abbreviation } from "./types";

/** Geschütztes Leerzeichen, damit der Verweis im Fliesstext nicht umbricht. */
export function referenceLabel(abbreviation: Abbreviation, number: number): string {
  const shown = number > 0 ? String(number) : "?";
  return `${abbreviation}\u00A0${shown}`;
}

export function referenceLabelPlain(abbreviation: Abbreviation, number: number): string {
  return referenceLabel(abbreviation, number).replaceAll("\u00A0", " ");
}

export function stampLabel(abbreviation: Abbreviation, number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("Der Stempel braucht eine Nummer ab 1.");
  }
  return `${abbreviation} ${number}`;
}

export function normalizeLabel(text: string): string {
  return text.replaceAll("\u00A0", " ").replace(/\s+/g, " ").trim();
}
