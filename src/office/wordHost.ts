import { normalizeLabel } from "../domain/labels";
import { parseState, pickNewest, serializeState } from "../domain/storage";
import { parseReferenceTag, referenceTag } from "../domain/tags";
import { DIRECTORY_TAG, XML_NAMESPACE, emptyState, type BeilagenState } from "../domain/types";
import type {
  BeilagenHost,
  DirectoryWriteResult,
  LabelWriteResult,
  MentionRead,
  TrackingState,
} from "./host";

const NAVY = "#1C3A5F";
const DIRECTORY_COLOR = "#5C6B7A";

/**
 * Änderungsverfolgung: der Verweistext wird ersetzt, die Beilagen-ID im Tag nicht.
 * Word protokolliert den neuen Text als Änderung. Ab WordApi 1.4 gilt ein vollständig
 * als gelöscht nachverfolgter Verweis nicht mehr für die Nummerierung. Das Add-in
 * schaltet die Nachverfolgung nicht aus.
 */
export class WordHost implements BeilagenHost {
  readonly inWord = true;
  private queue: Promise<unknown> = Promise.resolve();

  load(): Promise<BeilagenState> {
    return this.enqueue(() => loadInner());
  }

  save(state: BeilagenState): Promise<BeilagenState> {
    return this.enqueue(async () => {
      const next: BeilagenState = {
        ...state,
        revision: state.revision + 1,
        savedAt: new Date().toISOString(),
      };
      await writeXml(serializeState(next));
      return next;
    });
  }

  insertReference(exhibitId: string, label: string, title: string): Promise<void> {
    return this.enqueue(() => insertReferenceControl(exhibitId, label, title));
  }

  readMentions(): Promise<MentionRead> {
    return this.enqueue(() => readMentionOrder());
  }

  writeReferenceLabels(
    labels: ReadonlyMap<string, string>,
    titles: ReadonlyMap<string, string>,
  ): Promise<LabelWriteResult> {
    return this.enqueue(() => writeLabels(labels, titles));
  }

  directoryCount(): Promise<number> {
    return this.enqueue(() => countDirectories());
  }

  upsertDirectory(html: string, plain: string): Promise<DirectoryWriteResult> {
    return this.enqueue(async () => {
      try {
        return await upsertDirectory(html, plain);
      } catch (error) {
        if (error instanceof Error && error.message.includes("Beilagenverweis")) throw error;
        return upsertDirectory("", plain);
      }
    });
  }

  tracking(): Promise<TrackingState> {
    return this.enqueue(() => readTracking());
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function loadInner(): Promise<BeilagenState> {
  return new Promise((resolve, reject) => {
    Office.context.document.customXmlParts.getByNamespaceAsync(XML_NAMESPACE, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error("Die Beilagen im Dokument konnten nicht gelesen werden."));
        return;
      }
      const parts = result.value;
      if (parts.length === 0) {
        resolve(emptyState());
        return;
      }
      const states: BeilagenState[] = [];
      let firstError: Error | null = null;
      const readAt = (index: number) => {
        if (index >= parts.length) {
          if (states.length === 0) {
            reject(firstError ?? new Error("Die gespeicherten Beilagen sind unlesbar."));
            return;
          }
          resolve(pickNewest(states));
          return;
        }
        parts[index].getXmlAsync((xmlResult) => {
          if (xmlResult.status !== Office.AsyncResultStatus.Succeeded) {
            firstError = new Error("Ein Beilageneintrag im Dokument ist unlesbar.");
          } else {
            try {
              states.push(parseState(xmlResult.value));
            } catch (error) {
              firstError = error instanceof Error ? error : new Error(String(error));
            }
          }
          readAt(index + 1);
        });
      };
      readAt(0);
    });
  });
}

function writeXml(xml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Office.context.document.customXmlParts.getByNamespaceAsync(XML_NAMESPACE, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error("Die Beilagen konnten nicht gespeichert werden."));
        return;
      }
      const previous = result.value.slice();
      Office.context.document.customXmlParts.addAsync(xml, (addResult) => {
        if (addResult.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error("Die Beilagen konnten nicht gespeichert werden."));
          return;
        }
        const removeAt = (index: number) => {
          if (index >= previous.length) {
            resolve();
            return;
          }
          previous[index].deleteAsync(() => removeAt(index + 1));
        };
        removeAt(0);
      });
    });
  });
}

async function insertReferenceControl(exhibitId: string, label: string, title: string): Promise<void> {
  await Word.run(async (context) => {
    const selection = context.document.getSelection();
    const inserted = selection.insertText(label, Word.InsertLocation.end);
    const control = inserted.insertContentControl();
    control.tag = referenceTag(exhibitId);
    control.title = clipTitle(title);
    control.appearance = Word.ContentControlAppearance.boundingBox;
    control.cannotEdit = true;
    control.cannotDelete = false;
    control.color = NAVY;
    await context.sync();
  });
}

async function readMentionOrder(): Promise<MentionRead> {
  return Word.run(async (context) => {
    const controls = context.document.body.contentControls;
    controls.load("items/tag");
    await context.sync();
    const refs = controls.items.filter((control) => parseReferenceTag(control.tag));
    const supportsReview = Office.context.requirements.isSetSupported("WordApi", "1.4");
    const reviewed: OfficeExtension.ClientResult<string>[] = [];
    if (supportsReview) {
      for (const control of refs) reviewed.push(control.getReviewedText("Current"));
      await context.sync();
    }

    const kept: Word.ContentControl[] = [];
    let skippedDeleted = 0;
    refs.forEach((control, index) => {
      if (supportsReview && normalizeLabel(reviewed[index].value) === "") {
        skippedDeleted += 1;
        return;
      }
      kept.push(control);
    });

    const ids = kept.map((control) => parseReferenceTag(control.tag)!);
    if (ids.length < 2 || !Office.context.requirements.isSetSupported("WordApi", "1.3")) {
      return { ids, skippedDeleted };
    }

    try {
      const sorted = await sortByLocation(context, kept);
      return { ids: sorted, skippedDeleted };
    } catch {
      return { ids, skippedDeleted };
    }
  });
}

async function sortByLocation(
  context: Word.RequestContext,
  controls: Word.ContentControl[],
): Promise<string[]> {
  const ranges = controls.map((control) => control.getRange());
  const consecutive: OfficeExtension.ClientResult<Word.LocationRelation>[] = [];
  for (let index = 0; index < ranges.length - 1; index += 1) {
    consecutive.push(ranges[index].compareLocationWith(ranges[index + 1]));
  }
  await context.sync();
  const ordered = consecutive.every((relation) => !isAfter(relation.value));
  const ids = controls.map((control) => parseReferenceTag(control.tag)!);
  if (ordered || controls.length > 80) return ids;

  const matrix: OfficeExtension.ClientResult<Word.LocationRelation>[][] = [];
  for (let row = 0; row < ranges.length; row += 1) {
    matrix[row] = [];
    for (let column = 0; column < ranges.length; column += 1) {
      if (row === column) continue;
      matrix[row][column] = ranges[row].compareLocationWith(ranges[column]);
    }
  }
  await context.sync();
  const before = new Set(["Before", "AdjacentBefore", "Contains", "OverlapsBefore"]);
  const ranked = ids.map((id, index) => ({ id, index }));
  ranked.sort((a, b) => {
    const value = String(matrix[a.index][b.index].value);
    if (before.has(value)) return -1;
    const reverse = String(matrix[b.index][a.index].value);
    if (before.has(reverse)) return 1;
    return a.index - b.index;
  });
  return ranked.map((item) => item.id);
}

function isAfter(value: Word.LocationRelation | string): boolean {
  const text = String(value);
  return text === "After" || text === "AdjacentAfter";
}

async function writeLabels(
  labels: ReadonlyMap<string, string>,
  titles: ReadonlyMap<string, string>,
): Promise<LabelWriteResult> {
  const result: LabelWriteResult = {
    updated: 0,
    unchanged: 0,
    mismatched: 0,
    unknown: 0,
    tracked: 0,
  };
  const supportsReview = Office.context.requirements.isSetSupported("WordApi", "1.4");

  await Word.run(async (context) => {
    const controls = context.document.body.contentControls;
    controls.load("items/tag,text,cannotEdit,title");
    await context.sync();

    const targets = controls.items.filter((control) => parseReferenceTag(control.tag));
    const pending: Word.ContentControl[] = [];
    for (const control of targets) {
      const id = parseReferenceTag(control.tag)!;
      if (!labels.has(id)) {
        result.unknown += 1;
        continue;
      }
      const title = titles.get(id);
      if (title) control.title = clipTitle(title);
      const expected = normalizeLabel(labels.get(id)!);
      if (normalizeLabel(control.text) === expected) {
        result.unchanged += 1;
        continue;
      }
      control.cannotEdit = false;
      pending.push(control);
    }
    await context.sync();

    for (const control of pending) {
      const id = parseReferenceTag(control.tag)!;
      control.insertText(labels.get(id)!, Word.InsertLocation.replace);
      control.cannotEdit = true;
    }
    await context.sync();

    for (const control of pending) control.load("text");
    const reviewed: OfficeExtension.ClientResult<string>[] = [];
    if (supportsReview) {
      for (const control of pending) reviewed.push(control.getReviewedText("Current"));
    }
    await context.sync();

    pending.forEach((control, index) => {
      const id = parseReferenceTag(control.tag)!;
      const expected = normalizeLabel(labels.get(id)!);
      const raw = normalizeLabel(control.text);
      const current = supportsReview ? normalizeLabel(reviewed[index].value) : raw;
      if (raw === expected) result.updated += 1;
      else if (current === expected) result.tracked += 1;
      else result.mismatched += 1;
    });
  });

  return result;
}

async function countDirectories(): Promise<number> {
  return Word.run(async (context) => {
    const found = context.document.body.contentControls.getByTag(DIRECTORY_TAG);
    found.load("items");
    await context.sync();
    return found.items.length;
  });
}

async function upsertDirectory(html: string, plain: string): Promise<DirectoryWriteResult> {
  return Word.run(async (context) => {
    const found = context.document.body.contentControls.getByTag(DIRECTORY_TAG);
    found.load("items");
    await context.sync();

    if (found.items.length === 0) {
      const selection = context.document.getSelection();
      const inserted = selection.insertText("Beweismittelverzeichnis", Word.InsertLocation.end);
      const control = inserted.insertContentControl();
      control.tag = DIRECTORY_TAG;
      control.title = "Beweismittelverzeichnis";
      control.appearance = Word.ContentControlAppearance.boundingBox;
      control.cannotEdit = false;
      control.cannotDelete = false;
      control.color = DIRECTORY_COLOR;
      await context.sync();
      await replaceDirectoryContents(context, control, html, plain);
      return { action: "inserted" as const, count: 1 };
    }

    for (const control of found.items) {
      const nested = control.contentControls;
      nested.load("items/tag");
      await context.sync();
      if (nested.items.some((item) => parseReferenceTag(item.tag))) {
        throw new Error(
          "Im Verzeichnis steht ein Beilagenverweis. Bitte zuerst in den Text verschieben.",
        );
      }
      control.cannotEdit = false;
      await replaceDirectoryContents(context, control, html, plain);
    }
    return { action: "updated" as const, count: found.items.length };
  });
}

async function replaceDirectoryContents(
  context: Word.RequestContext,
  control: Word.ContentControl,
  html: string,
  plain: string,
): Promise<void> {
  if (plain && html.trim() === "") {
    control.insertText(plain, Word.InsertLocation.replace);
    await context.sync();
    return;
  }
  control.insertHtml(html, Word.InsertLocation.replace);
  await context.sync();
}

async function readTracking(): Promise<TrackingState> {
  if (!Office.context.requirements.isSetSupported("WordApi", "1.4")) return "unknown";
  try {
    return await Word.run(async (context) => {
      context.document.load("changeTrackingMode");
      await context.sync();
      return context.document.changeTrackingMode === Word.ChangeTrackingMode.off ? "off" : "on";
    });
  } catch {
    return "unknown";
  }
}

function clipTitle(title: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if ([...clean].length <= 64) return clean;
  return `${[...clean].slice(0, 63).join("").trimEnd()}…`;
}
