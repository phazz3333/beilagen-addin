export const ABBREVIATIONS = ["KB", "AB", "RB", "DB"] as const;

export type Abbreviation = (typeof ABBREVIATIONS)[number];

export const ABBREVIATION_NAMES: Record<Abbreviation, string> = {
  KB: "Klagebeilage",
  AB: "Antwortbeilage",
  RB: "Replikbeilage",
  DB: "Duplikbeilage",
};

export interface Exhibit {
  id: string;
  title: string;
  /** ISO-Datum YYYY-MM-DD, oder leer wenn keins bekannt ist. */
  date: string;
  /** 0, solange kein Verweis im Dokument steht. */
  number: number;
}

export interface BeilagenState {
  version: 1;
  revision: number;
  /** ISO-Zeitpunkt der letzten Speicherung, leer bei einem neuen Dokument. */
  savedAt: string;
  abbreviation: Abbreviation | null;
  exhibits: Exhibit[];
}

export const XML_NAMESPACE = "urn:balthasar-legal:beilagen:v1";
export const REF_TAG_PREFIX = "bl:ref:";
export const DIRECTORY_TAG = "bl:verzeichnis";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAbbreviation(value: unknown): value is Abbreviation {
  return typeof value === "string" && (ABBREVIATIONS as readonly string[]).includes(value);
}

export function isExhibitId(value: string): boolean {
  return UUID_RE.test(value);
}

export function emptyState(): BeilagenState {
  return { version: 1, revision: 0, savedAt: "", abbreviation: null, exhibits: [] };
}
