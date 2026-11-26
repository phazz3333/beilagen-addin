import { reapplicableFont, type FontStyle } from "../domain/fontStyle";
import { normalizeLabel, planCitationUpdate, type CitationText } from "../domain/labels";
import { parseState, pickNewest, serializeState } from "../domain/storage";
import {
  descriptionTag,
  numberTag,
  parseDescriptionTag,
  parseNumberTag,
  parseReferenceTag,
  referenceTag,
} from "../domain/tags";
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

  insertReference(exhibitId: string, citation: CitationText): Promise<void> {
    return this.enqueue(() => insertReferenceControl(exhibitId, citation));
  }

  readMentions(): Promise<MentionRead> {
    return this.enqueue(() => readMentionOrder());
  }

  writeReferenceLabels(citations: ReadonlyMap<string, CitationText>): Promise<LabelWriteResult> {
    return this.enqueue(() => writeLabels(citations));
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

async function insertReferenceControl(exhibitId: string, citation: CitationText): Promise<void> {
  await Word.run(async (context) => {
    const selection = context.document.getSelection();
    const inserted = selection.insertText(citation.plain, Word.InsertLocation.end);
    const outer = inserted.insertContentControl();
    markOuter(outer, citation.description, exhibitId);
    await context.sync();
    if (Office.context.requirements.isSetSupported("WordApi", "1.3")) {
      await composeCitation(context, outer, citation, exhibitId);
    }
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

async function writeLabels(citations: ReadonlyMap<string, CitationText>): Promise<LabelWriteResult> {
  const result: LabelWriteResult = {
    updated: 0,
    unchanged: 0,
    mismatched: 0,
    unknown: 0,
    tracked: 0,
  };
  const supportsPieces = Office.context.requirements.isSetSupported("WordApi", "1.3");
  const supportsReview = Office.context.requirements.isSetSupported("WordApi", "1.4");

  await Word.run(async (context) => {
    const controls = context.document.body.contentControls;
    controls.load("items/tag");
    await context.sync();
    const targets = controls.items.filter((control) => parseReferenceTag(control.tag));

    for (const outer of targets) {
      const id = parseReferenceTag(outer.tag)!;
      const citation = citations.get(id);
      if (!citation) {
        result.unknown += 1;
        continue;
      }
      outer.title = clipTitle(citation.description);
      outer.cannotEdit = false;
      outer.cannotDelete = true;
      if (!supportsPieces) {
        const changed = await replaceTextKeepingFont(context, outer, citation.plain);
        outer.cannotDelete = false;
        if (changed) result.updated += 1;
        else result.unchanged += 1;
        continue;
      }

      const nested = outer.contentControls;
      nested.load("items/tag,text");
      await context.sync();
      const numberControl = nested.items.find((item) => parseNumberTag(item.tag));
      const descriptionControl = nested.items.find((item) => parseDescriptionTag(item.tag));
      let currentOrder: CitationText["order"] | null = null;
      if (numberControl && descriptionControl) {
        const relation = numberControl.getRange().compareLocationWith(descriptionControl.getRange());
        await context.sync();
        currentOrder = isAfter(relation.value) ? "description-first" : "number-first";
      }
      const plan = planCitationUpdate({
        hasNumberControl: Boolean(numberControl),
        hasDescriptionControl: Boolean(descriptionControl),
        currentOrder,
        desired: citation,
        currentNumberText: numberControl?.text ?? "",
        currentDescription: descriptionControl?.text ?? "",
      });
      if (plan.rebuild) {
        const fallbackFont = await readFont(context, outer);
        const numberFont = numberControl ? await readFont(context, numberControl) : fallbackFont;
        const descriptionFont = descriptionControl ? await readFont(context, descriptionControl) : fallbackFont;
        await composeCitation(context, outer, citation, id);
        const fresh = outer.contentControls;
        fresh.load("items/tag");
        await context.sync();
        const nextNumber = fresh.items.find((item) => parseNumberTag(item.tag));
        const nextDescription = fresh.items.find((item) => parseDescriptionTag(item.tag));
        if (nextNumber) applyFont(nextNumber.font, numberFont);
        if (nextDescription) applyFont(nextDescription.font, descriptionFont);
        await context.sync();
        result.updated += 1;
      } else {
        let changed = false;
        if (plan.updateNumber && numberControl) {
          changed = (await replaceTextKeepingFont(context, numberControl, citation.numberText)) || changed;
        }
        if (plan.updateDescription && descriptionControl) {
          changed = (await replaceTextKeepingFont(context, descriptionControl, citation.description)) || changed;
        }
        if (changed && supportsReview && numberControl && plan.updateNumber) {
          numberControl.load("text");
          const reviewed = numberControl.getReviewedText("Current");
          await context.sync();
          const expected = normalizeLabel(citation.numberText);
          if (normalizeLabel(numberControl.text) === expected) result.updated += 1;
          else if (normalizeLabel(reviewed.value) === expected) result.tracked += 1;
          else result.mismatched += 1;
        } else if (changed) result.updated += 1;
        else result.unchanged += 1;
      }
      outer.cannotDelete = false;
    }
    await context.sync();
  });

  return result;
}

function markOuter(control: Word.ContentControl, description: string, exhibitId: string): void {
  control.tag = referenceTag(exhibitId);
  control.title = clipTitle(description);
  control.appearance = Word.ContentControlAppearance.boundingBox;
  control.cannotEdit = false;
  control.cannotDelete = false;
  control.color = NAVY;
}

async function composeCitation(
  context: Word.RequestContext,
  outer: Word.ContentControl,
  citation: CitationText,
  exhibitId: string,
): Promise<void> {
  outer.cannotDelete = true;
  outer.cannotEdit = false;
  const range = outer.getRange(Word.RangeLocation.content);
  if (citation.order === "number-first") {
    const numberRange = range.insertText(citation.numberText, Word.InsertLocation.replace);
    const numberControl = numberRange.insertContentControl();
    markPiece(numberControl, numberTag(exhibitId));
    await context.sync();
    const separator = numberControl.getRange(Word.RangeLocation.whole).insertText(" ", Word.InsertLocation.after);
    const descriptionRange = separator.insertText(citation.description, Word.InsertLocation.after);
    markPiece(descriptionRange.insertContentControl(), descriptionTag(exhibitId));
  } else {
    const descriptionRange = range.insertText(citation.description, Word.InsertLocation.replace);
    const descriptionControl = descriptionRange.insertContentControl();
    markPiece(descriptionControl, descriptionTag(exhibitId));
    await context.sync();
    const opener = descriptionControl.getRange(Word.RangeLocation.whole).insertText(" (", Word.InsertLocation.after);
    const numberRange = opener.insertText(citation.numberText, Word.InsertLocation.after);
    const numberControl = numberRange.insertContentControl();
    markPiece(numberControl, numberTag(exhibitId));
    await context.sync();
    numberControl.getRange(Word.RangeLocation.whole).insertText(")", Word.InsertLocation.after);
  }
  outer.cannotDelete = false;
  await context.sync();
}

function markPiece(control: Word.ContentControl, tag: string): void {
  control.tag = tag;
  control.appearance = Word.ContentControlAppearance.hidden;
  control.cannotEdit = false;
  control.cannotDelete = false;
}

async function replaceTextKeepingFont(
  context: Word.RequestContext,
  control: Word.ContentControl,
  text: string,
): Promise<boolean> {
  control.load("text");
  control.font.load("bold,italic,name,size,color,underline");
  await context.sync();
  if (normalizeLabel(control.text) === normalizeLabel(text)) return false;
  const style = readFontValue(control.font);
  control.cannotEdit = false;
  control.insertText(text, Word.InsertLocation.replace);
  applyFont(control.font, style);
  await context.sync();
  return true;
}

async function readFont(context: Word.RequestContext, control: Word.ContentControl): Promise<FontStyle> {
  control.font.load("bold,italic,name,size,color,underline");
  await context.sync();
  return readFontValue(control.font);
}

function readFontValue(font: Word.Font): FontStyle {
  return {
    bold: typeof font.bold === "boolean" ? font.bold : null,
    italic: typeof font.italic === "boolean" ? font.italic : null,
    name: typeof font.name === "string" ? font.name : null,
    size: typeof font.size === "number" ? font.size : null,
    color: typeof font.color === "string" ? font.color : null,
    underline: font.underline ? String(font.underline) : null,
  };
}

function applyFont(font: Word.Font, style: FontStyle): void {
  const keep = reapplicableFont(style);
  if (typeof keep.bold === "boolean") font.bold = keep.bold;
  if (typeof keep.italic === "boolean") font.italic = keep.italic;
  if (keep.name) font.name = keep.name;
  if (typeof keep.size === "number") font.size = keep.size;
  if (keep.color) font.color = keep.color;
  if (keep.underline) font.underline = keep.underline as Word.UnderlineType;
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
