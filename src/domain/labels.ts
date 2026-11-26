import type { CitationOrder } from "./types";

export interface CitationText {
  /** Kürzel und Nummer, mit geschütztem Leerzeichen. */
  numberText: string;
  description: string;
  order: CitationOrder;
  /** Ganzer Verweis, falls kein verschachteltes Steuerelement möglich ist. */
  plain: string;
}

/** Geschütztes Leerzeichen, damit «KB 1» nicht umbricht. */
export function referenceLabel(abbreviation: string, number: number): string {
  const shown = number > 0 ? String(number) : "?";
  return `${abbreviation}\u00A0${shown}`;
}

/**
 * Standard ist die Nummer links: «KB 1 Kaufvertrag vom 3. März 2025».
 * Die andere Folge setzt die Nummer in Klammern hinter die Bezeichnung.
 */
export function buildCitation(
  abbreviation: string,
  number: number,
  description: string,
  order: CitationOrder,
): CitationText {
  const numberText = referenceLabel(abbreviation, number);
  const title = description.trim();
  const plain =
    order === "description-first" ? `${title} (${numberText})` : `${numberText} ${title}`;
  return { numberText, description: title, order, plain };
}

export interface CitationUpdatePlan {
  /** Äusseres Steuerelement bleibt. Inhalt wird neu aufgebaut, weil Folge oder Struktur fehlt. */
  rebuild: boolean;
  updateNumber: boolean;
  updateDescription: boolean;
}

/** Entscheid, welche Teile angefasst werden. Das äussere Steuerelement wird nie gelöscht. */
export function planCitationUpdate(input: {
  hasNumberControl: boolean;
  hasDescriptionControl: boolean;
  currentOrder: CitationOrder | null;
  desired: CitationText;
  currentNumberText: string;
  currentDescription: string;
}): CitationUpdatePlan {
  const structureOk =
    input.hasNumberControl &&
    input.hasDescriptionControl &&
    input.currentOrder === input.desired.order;
  if (!structureOk) {
    return { rebuild: true, updateNumber: false, updateDescription: false };
  }
  return {
    rebuild: false,
    updateNumber: normalizeLabel(input.currentNumberText) !== normalizeLabel(input.desired.numberText),
    updateDescription:
      normalizeLabel(input.currentDescription) !== normalizeLabel(input.desired.description),
  };
}

export function referenceLabelPlain(abbreviation: string, number: number): string {
  return referenceLabel(abbreviation, number).replaceAll("\u00A0", " ");
}

export function stampLabel(abbreviation: string, number: number): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("Der Stempel braucht eine Nummer ab 1.");
  }
  return `${abbreviation} ${number}`;
}

export function normalizeLabel(text: string): string {
  return text.replaceAll("\u00A0", " ").replace(/\s+/g, " ").trim();
}
