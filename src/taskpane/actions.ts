import { directoryModel, renderDirectoryHtml, renderDirectoryPlain } from "../domain/directory";
import { buildCitation, referenceLabelPlain, type CitationText } from "../domain/labels";
import { renumberExhibits } from "../domain/numbering";
import { normalizeDate, sanitizeTitle } from "../domain/text";
import { sanitizePrefix, type BeilagenState, type CitationOrder, type Exhibit } from "../domain/types";
import type { BeilagenHost, LabelWriteResult } from "../office/host";

export interface ActionResult {
  state: BeilagenState;
  status: string;
  warning?: string;
  directoryPresent: boolean;
}

export async function changeAbbreviation(
  host: BeilagenHost,
  state: BeilagenState,
  abbreviation: string,
): Promise<ActionResult> {
  const prefix = sanitizePrefix(abbreviation);
  if (!prefix) throw new Error("Das Kürzel ist ungültig.");
  const next = { ...state, abbreviation: prefix };
  if (state.exhibits.length === 0) {
    const saved = await host.save(next);
    return {
      state: saved,
      status: `Kürzel ${abbreviation} gespeichert.`,
      directoryPresent: (await host.directoryCount()) > 0,
    };
  }
  const refreshed = await refreshNumbers(host, next);
  return {
    state: refreshed.state,
    status: `Kürzel ${abbreviation} gespeichert. Verweise angepasst.`,
    warning: refreshed.warning,
    directoryPresent: refreshed.directoryPresent,
  };
}

export async function changeCitationOrder(
  host: BeilagenHost,
  state: BeilagenState,
  citationOrder: CitationOrder,
): Promise<ActionResult> {
  const next = { ...state, citationOrder };
  if (state.exhibits.length === 0 || !state.abbreviation) {
    const saved = await host.save(next);
    return {
      state: saved,
      status: "Reihenfolge gespeichert.",
      directoryPresent: (await host.directoryCount()) > 0,
    };
  }
  const refreshed = await refreshNumbers(host, next);
  return {
    state: refreshed.state,
    status: "Reihenfolge gespeichert. Verweise angepasst.",
    warning: refreshed.warning,
    directoryPresent: refreshed.directoryPresent,
  };
}

export async function insertNewExhibit(
  host: BeilagenHost,
  state: BeilagenState,
  input: { title: string; date: string },
): Promise<ActionResult> {
  if (!state.abbreviation) throw new Error("Zuerst das Kürzel der Rechtsschrift wählen.");
  const title = sanitizeTitle(input.title);
  if (!title) throw new Error("Bitte eine Bezeichnung eingeben.");
  const date = normalizeDate(input.date);
  if (input.date.trim() && !date) throw new Error("Das Datum ist ungültig.");
  const exhibit: Exhibit = { id: crypto.randomUUID(), title, date, number: 0 };
  await host.insertReference(
    exhibit.id,
    buildCitation(state.abbreviation, 0, title, state.citationOrder),
  );
  const refreshed = await refreshNumbers(host, {
    ...state,
    exhibits: [...state.exhibits, exhibit],
  });
  const number = refreshed.state.exhibits.find((item) => item.id === exhibit.id)?.number ?? 0;
  const label =
    number > 0
      ? buildCitation(state.abbreviation, number, title, state.citationOrder).plain.replaceAll("\u00A0", " ")
      : title;
  const where = host.inWord ? "am Cursor eingefügt" : "erfasst";
  return {
    state: refreshed.state,
    status: `${label} ${where}.`,
    warning: refreshed.warning,
    directoryPresent: refreshed.directoryPresent,
  };
}

export async function insertExistingExhibit(
  host: BeilagenHost,
  state: BeilagenState,
  exhibitId: string,
): Promise<ActionResult> {
  if (!state.abbreviation) throw new Error("Zuerst das Kürzel der Rechtsschrift wählen.");
  const exhibit = state.exhibits.find((item) => item.id === exhibitId);
  if (!exhibit) throw new Error("Diese Beilage gibt es nicht.");
  await host.insertReference(
    exhibit.id,
    buildCitation(state.abbreviation, exhibit.number, exhibit.title, state.citationOrder),
  );
  const refreshed = await refreshNumbers(host, state);
  const number = refreshed.state.exhibits.find((item) => item.id === exhibit.id)?.number ?? exhibit.number;
  const label = number > 0 ? referenceLabelPlain(state.abbreviation, number) : exhibit.title;
  const where = host.inWord ? "am Cursor eingefügt" : "erneut erfasst";
  return {
    state: refreshed.state,
    status: `${label} ${where}.`,
    warning: refreshed.warning,
    directoryPresent: refreshed.directoryPresent,
  };
}

export async function renumberDocument(host: BeilagenHost, state: BeilagenState): Promise<ActionResult> {
  if (!state.abbreviation) throw new Error("Zuerst das Kürzel der Rechtsschrift wählen.");
  const refreshed = await refreshNumbers(host, state);
  const count = refreshed.state.exhibits.filter((exhibit) => exhibit.number > 0).length;
  const orphans = refreshed.state.exhibits.length - count;
  const orphanText = orphans > 0 ? `, ${orphans} ohne Verweis` : "";
  return {
    state: refreshed.state,
    status: `Neu nummeriert. ${count} ${count === 1 ? "Beilage" : "Beilagen"}${orphanText}.`,
    warning: refreshed.warning,
    directoryPresent: refreshed.directoryPresent,
  };
}

export async function updateExhibit(
  host: BeilagenHost,
  state: BeilagenState,
  exhibitId: string,
  patch: { title: string; date: string },
): Promise<ActionResult> {
  const title = sanitizeTitle(patch.title);
  if (!title) throw new Error("Bitte eine Bezeichnung eingeben.");
  const date = normalizeDate(patch.date);
  if (patch.date.trim() && !date) throw new Error("Das Datum ist ungültig.");
  if (!state.exhibits.some((exhibit) => exhibit.id === exhibitId)) {
    throw new Error("Diese Beilage gibt es nicht.");
  }
  const saved = await host.save({
    ...state,
    exhibits: state.exhibits.map((exhibit) =>
      exhibit.id === exhibitId ? { ...exhibit, title, date } : exhibit,
    ),
  });
  const written = await host.writeReferenceLabels(citationMap(saved));
  const directoryPresent = await refreshDirectory(host, saved);
  return {
    state: saved,
    status: "Beilage angepasst.",
    warning: warningText(written, 0),
    directoryPresent,
  };
}

export async function removeOrphan(
  host: BeilagenHost,
  state: BeilagenState,
  exhibitId: string,
): Promise<ActionResult> {
  const exhibit = state.exhibits.find((item) => item.id === exhibitId);
  if (!exhibit) throw new Error("Diese Beilage gibt es nicht.");
  if (exhibit.number !== 0) {
    throw new Error("Zuerst alle Verweise auf diese Beilage löschen und neu nummerieren.");
  }
  const saved = await host.save({
    ...state,
    exhibits: state.exhibits.filter((item) => item.id !== exhibitId),
  });
  return {
    state: saved,
    status: "Beilage entfernt.",
    directoryPresent: (await host.directoryCount()) > 0,
  };
}

export async function placeDirectory(host: BeilagenHost, state: BeilagenState): Promise<ActionResult> {
  const model = directoryModel(state);
  if (model.rows.length === 0) {
    throw new Error("Keine nummerierte Beilage. Zuerst einen Verweis einfügen.");
  }
  const result = await host.upsertDirectory(renderDirectoryHtml(model), renderDirectoryPlain(model));
  const status =
    result.action === "inserted"
      ? host.inWord
        ? "Verzeichnis am Cursor eingefügt."
        : "Verzeichnis erstellt."
      : "Verzeichnis aktualisiert.";
  return { state, status, directoryPresent: true };
}

async function refreshNumbers(host: BeilagenHost, state: BeilagenState) {
  const mentions = await host.readMentions();
  const renumbered = renumberExhibits(state.exhibits, mentions.ids);
  const saved = await host.save({ ...state, exhibits: renumbered.exhibits });
  const written = await host.writeReferenceLabels(citationMap(saved));
  const directoryPresent = await refreshDirectory(host, saved);
  return {
    state: saved,
    warning: warningText(written, mentions.skippedDeleted),
    directoryPresent,
  };
}

async function refreshDirectory(host: BeilagenHost, state: BeilagenState): Promise<boolean> {
  if ((await host.directoryCount()) === 0 || !state.abbreviation) return false;
  const model = directoryModel(state);
  await host.upsertDirectory(renderDirectoryHtml(model), renderDirectoryPlain(model));
  return true;
}

function citationMap(state: BeilagenState): Map<string, CitationText> {
  const map = new Map<string, CitationText>();
  if (!state.abbreviation) return map;
  for (const exhibit of state.exhibits) {
    if (exhibit.number > 0) {
      map.set(
        exhibit.id,
        buildCitation(state.abbreviation, exhibit.number, exhibit.title, state.citationOrder),
      );
    }
  }
  return map;
}

function warningText(labels: LabelWriteResult, skippedDeleted: number): string | undefined {
  const parts: string[] = [];
  if (labels.tracked > 0) {
    parts.push(
      "Die neue Nummer ist als nachverfolgte Änderung sichtbar. Vor dem Versand annehmen oder die Nachverfolgung aussetzen.",
    );
  }
  if (labels.mismatched > 0) {
    parts.push(
      labels.mismatched === 1
        ? "1 Verweis liess sich nicht anpassen."
        : `${labels.mismatched} Verweise liessen sich nicht anpassen.`,
    );
  }
  if (labels.unknown > 0) {
    parts.push(
      labels.unknown === 1
        ? "1 Verweis im Text hat keinen Eintrag und wurde ausgelassen."
        : `${labels.unknown} Verweise im Text haben keinen Eintrag und wurden ausgelassen.`,
    );
  }
  if (skippedDeleted > 0) {
    parts.push(
      skippedDeleted === 1
        ? "1 Verweis ist in der Änderungsverfolgung als gelöscht markiert und wurde nicht nummeriert."
        : `${skippedDeleted} Verweise sind in der Änderungsverfolgung als gelöscht markiert und wurden nicht nummeriert.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}
