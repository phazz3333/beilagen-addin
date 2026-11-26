import type { CitationText } from "../domain/labels";
import { parseState, serializeState } from "../domain/storage";
import { emptyState, type BeilagenState } from "../domain/types";
import type {
  BeilagenHost,
  DirectoryWriteResult,
  LabelWriteResult,
  MentionRead,
  TrackingState,
} from "./host";

/** Speicher nur im Arbeitsspeicher, für Vorschau und Tests. Schreibt durch das XML-Format. */
export class MemoryHost implements BeilagenHost {
  readonly inWord = false;
  private state: BeilagenState;
  private mentions: string[] = [];
  private directory = 0;
  lastDirectoryHtml = "";

  constructor(initial?: BeilagenState) {
    this.state = initial ?? emptyState();
    this.mentions = this.state.exhibits
      .filter((exhibit) => exhibit.number > 0)
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((exhibit) => exhibit.id);
  }

  async load(): Promise<BeilagenState> {
    return this.state;
  }

  async save(state: BeilagenState): Promise<BeilagenState> {
    const next: BeilagenState = {
      ...state,
      revision: state.revision + 1,
      savedAt: new Date().toISOString(),
    };
    this.state = parseState(serializeState(next));
    return this.state;
  }

  async insertReference(exhibitId: string): Promise<void> {
    this.mentions.push(exhibitId.toLowerCase());
  }

  async readMentions(): Promise<MentionRead> {
    return { ids: [...this.mentions], skippedDeleted: 0 };
  }

  replaceMentions(ids: readonly string[]): void {
    this.mentions = ids.map((id) => id.toLowerCase());
  }

  async writeReferenceLabels(
    labels: ReadonlyMap<string, CitationText>,
  ): Promise<LabelWriteResult> {
    let updated = 0;
    let unknown = 0;
    const seen = new Set<string>();
    for (const id of this.mentions) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (labels.has(id)) updated += 1;
      else unknown += 1;
    }
    return { updated, unchanged: 0, mismatched: 0, unknown, tracked: 0 };
  }

  async directoryCount(): Promise<number> {
    return this.directory;
  }

  async upsertDirectory(html: string): Promise<DirectoryWriteResult> {
    const action = this.directory > 0 ? "updated" : "inserted";
    this.directory = 1;
    this.lastDirectoryHtml = html;
    return { action, count: this.directory };
  }

  async tracking(): Promise<TrackingState> {
    return "off";
  }
}
