import { referenceLabelPlain } from "./labels";
import { escapeHtml, formatSwissDate } from "./text";
import { isPresetPrefix, type Abbreviation, type BeilagenState } from "./types";

export interface DirectoryRow {
  label: string;
  title: string;
  date: string;
}

export interface DirectoryModel {
  heading: string;
  kind: string;
  abbreviation: string;
  rows: DirectoryRow[];
}

const KIND: Record<Abbreviation, string> = {
  KB: "Klagebeilagen",
  AB: "Antwortbeilagen",
  RB: "Replikbeilagen",
  DB: "Duplikbeilagen",
};

export function directoryModel(state: BeilagenState): DirectoryModel {
  if (!state.abbreviation) {
    throw new Error("Zuerst das Kürzel der Rechtsschrift wählen.");
  }
  const abbreviation = state.abbreviation;
  const rows = state.exhibits
    .filter((exhibit) => exhibit.number > 0)
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((exhibit) => ({
      label: referenceLabelPlain(abbreviation, exhibit.number),
      title: exhibit.title,
      date: formatSwissDate(exhibit.date) || "–",
    }));
  return {
    heading: "Beweismittelverzeichnis",
    kind: isPresetPrefix(abbreviation) ? KIND[abbreviation] : `Beilagen ${abbreviation}`,
    abbreviation,
    rows,
  };
}

export function renderDirectoryHtml(model: DirectoryModel): string {
  const body = model.rows
    .map(
      (row) =>
        `<tr><td style="border:1px solid #1d1d1f;padding:4px 8px;white-space:nowrap;vertical-align:top">${escapeHtml(row.label)}</td>` +
        `<td style="border:1px solid #1d1d1f;padding:4px 8px;vertical-align:top">${escapeHtml(row.title)}</td>` +
        `<td style="border:1px solid #1d1d1f;padding:4px 8px;white-space:nowrap;vertical-align:top">${escapeHtml(row.date)}</td></tr>`,
    )
    .join("");
  return (
    `<div><p><b>${escapeHtml(model.heading)}</b></p>` +
    `<table style="border-collapse:collapse" border="1">` +
    `<tr><td style="border:1px solid #1d1d1f;padding:4px 8px"><b>Nr.</b></td>` +
    `<td style="border:1px solid #1d1d1f;padding:4px 8px"><b>Bezeichnung</b></td>` +
    `<td style="border:1px solid #1d1d1f;padding:4px 8px"><b>Datum</b></td></tr>` +
    body +
    `</table></div>`
  );
}

export function renderDirectoryPlain(model: DirectoryModel): string {
  const lines = [model.heading, "", "Nr.\tBezeichnung\tDatum"];
  for (const row of model.rows) {
    lines.push(`${row.label}\t${row.title}\t${row.date}`);
  }
  return lines.join("\n");
}
