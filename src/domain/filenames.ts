import type { Abbreviation } from "./types";

const ILLEGAL = /[\\/:*?"<>|]/g;

export function baseName(fileName: string): string {
  const slash = Math.max(fileName.lastIndexOf("/"), fileName.lastIndexOf("\\"));
  return slash >= 0 ? fileName.slice(slash + 1) : fileName;
}

export function sanitizeFileStem(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/g, "")
    .replace(/[. ]+$/g, "");
  const cut = [...cleaned].slice(0, 80).join("").trim().replace(/[. ]+$/g, "");
  return cut || "Beilage";
}

export function exhibitFileName(abbreviation: Abbreviation, number: number, title: string): string {
  if (!Number.isInteger(number) || number < 1) {
    throw new Error("Der Dateiname braucht eine Nummer ab 1.");
  }
  const padded = String(number).padStart(2, "0");
  return `${abbreviation} ${padded} - ${sanitizeFileStem(title)}.pdf`;
}

export const DIRECTORY_PDF_NAME = "00 Beweismittelverzeichnis.pdf";

export function packageZipName(abbreviation: Abbreviation): string {
  return `Beilagen-${abbreviation}.zip`;
}
