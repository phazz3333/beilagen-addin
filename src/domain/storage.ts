import {
  XML_NAMESPACE,
  emptyState,
  isExhibitId,
  sanitizePrefix,
  type BeilagenState,
  type CitationOrder,
  type Exhibit,
} from "./types";
import { escapeXml, normalizeDate, sanitizeTitle, unescapeXml } from "./text";

const TAG = "(?:[\\w.-]+:)?";

export function serializeState(state: BeilagenState): string {
  const kuerzel = state.abbreviation
    ? `<Kuerzel>${escapeXml(state.abbreviation)}</Kuerzel>`
    : "<Kuerzel></Kuerzel>";
  const folge = state.citationOrder === "description-first" ? "bezeichnung" : "nummer";
  const entries = state.exhibits
    .map((exhibit) => {
      const datum = exhibit.date ? ` datum="${escapeXml(exhibit.date)}"` : "";
      return `<Eintrag id="${escapeXml(exhibit.id)}" nummer="${exhibit.number}"${datum}><Bezeichnung>${escapeXml(exhibit.title)}</Bezeichnung></Eintrag>`;
    })
    .join("");
  return `<Beilagen xmlns="${XML_NAMESPACE}" version="1" revision="${state.revision}" savedAt="${escapeXml(state.savedAt)}" folge="${folge}">${kuerzel}${entries}</Beilagen>`;
}

export function parseState(xml: string): BeilagenState {
  const root = xml.match(new RegExp(`<${TAG}Beilagen\\b([^>]*)>`));
  if (!root) {
    throw new Error("Die gespeicherten Beilagen sind unlesbar.");
  }
  const version = Number(attr(root[1], "version") ?? "1");
  if (Number.isFinite(version) && version > 1) {
    throw new Error("Diese Beilagen wurden mit einer neueren Version des Add-ins gespeichert.");
  }
  const revision = Number(attr(root[1], "revision") ?? "0");
  const savedAt = attr(root[1], "savedAt") ?? "";
  const kuerzelMatch = xml.match(new RegExp(`<${TAG}Kuerzel>([\\s\\S]*?)</${TAG}Kuerzel>`));
  const abbreviationRaw = kuerzelMatch ? unescapeXml(kuerzelMatch[1].trim()) : "";
  const abbreviation = sanitizePrefix(abbreviationRaw);
  const citationOrder: CitationOrder =
    attr(root[1], "folge") === "bezeichnung" ? "description-first" : "number-first";

  const exhibits: Exhibit[] = [];
  const seen = new Set<string>();
  const entryRe = new RegExp(`<${TAG}Eintrag\\b([^>]*)>([\\s\\S]*?)</${TAG}Eintrag>`, "g");
  for (const entry of xml.matchAll(entryRe)) {
    const idRaw = attr(entry[1], "id") ?? "";
    const id = idRaw.toLowerCase();
    if (!isExhibitId(id) || seen.has(id)) continue;
    const titleMatch = entry[2].match(new RegExp(`<${TAG}Bezeichnung>([\\s\\S]*?)</${TAG}Bezeichnung>`));
    const title = sanitizeTitle(titleMatch ? unescapeXml(titleMatch[1]) : "");
    if (!title) continue;
    const date = normalizeDate(attr(entry[1], "datum") ?? "");
    const numberRaw = Number(attr(entry[1], "nummer") ?? "0");
    const number = Number.isInteger(numberRaw) && numberRaw > 0 && numberRaw < 10000 ? numberRaw : 0;
    seen.add(id);
    exhibits.push({ id, title, date, number });
  }

  if (!Number.isInteger(revision) || revision < 0) {
    return { ...emptyState(), abbreviation, citationOrder, exhibits, savedAt };
  }
  return {
    version: 1,
    revision,
    savedAt,
    abbreviation,
    citationOrder,
    exhibits,
  };
}

export function pickNewest(states: readonly BeilagenState[]): BeilagenState {
  if (states.length === 0) return emptyState();
  return states.slice().sort((a, b) => {
    if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
    return b.revision - a.revision;
  })[0];
}

function attr(source: string, name: string): string | null {
  const match = source.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? unescapeXml(match[1]) : null;
}
