import type { CitationText } from "../domain/labels";
import type { BeilagenState } from "../domain/types";

export interface LabelWriteResult {
  updated: number;
  unchanged: number;
  mismatched: number;
  unknown: number;
  /** Sichtbarer Text weicht ab, der angenommene Stand stimmt aber. */
  tracked: number;
}

export interface MentionRead {
  ids: string[];
  /** Als gelöscht nachverfolgte Verweise, die nicht mitgezählt werden. */
  skippedDeleted: number;
}

export interface DirectoryWriteResult {
  action: "inserted" | "updated";
  count: number;
}

export type TrackingState = "off" | "on" | "unknown";

export interface BeilagenHost {
  readonly inWord: boolean;
  load(): Promise<BeilagenState>;
  save(state: BeilagenState): Promise<BeilagenState>;
  insertReference(exhibitId: string, citation: CitationText): Promise<void>;
  /** Löscht alle äusseren Verweise dieser Beilage, inklusive Nummer und Bezeichnung. */
  deleteReferences(exhibitId: string): Promise<number>;
  readMentions(): Promise<MentionRead>;
  writeReferenceLabels(citations: ReadonlyMap<string, CitationText>): Promise<LabelWriteResult>;
  directoryCount(): Promise<number>;
  upsertDirectory(html: string, plain: string): Promise<DirectoryWriteResult>;
  tracking(): Promise<TrackingState>;
}
