import { baseName } from "./filenames";
import type { Exhibit } from "./types";

export interface PdfMatch {
  exhibitId: string;
  fileName: string;
}

export function matchPdfFiles(
  fileNames: readonly string[],
  abbreviation: string,
  exhibits: readonly Exhibit[],
): { matches: PdfMatch[]; unmatched: string[] } {
  const byNumber = new Map<number, string>();
  for (const exhibit of exhibits) {
    if (exhibit.number > 0 && !byNumber.has(exhibit.number)) {
      byNumber.set(exhibit.number, exhibit.id);
    }
  }
  const pattern = new RegExp(`^${escapeRegExp(abbreviation)}[\\s._-]*(\\d+)(?!\\d)`, "i");
  const used = new Set<string>();
  const matches: PdfMatch[] = [];
  const unmatched: string[] = [];

  for (const original of fileNames) {
    const name = baseName(original);
    const stem = name.replace(/\.pdf$/i, "");
    const found = stem.match(pattern);
    const number = found ? Number(found[1]) : Number.NaN;
    const exhibitId = byNumber.get(number);
    if (!exhibitId || used.has(exhibitId)) {
      unmatched.push(name);
      continue;
    }
    used.add(exhibitId);
    matches.push({ exhibitId, fileName: name });
  }

  return { matches, unmatched };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
