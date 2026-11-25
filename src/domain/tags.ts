import { DIRECTORY_TAG, REF_TAG_PREFIX, isExhibitId } from "./types";

export function referenceTag(exhibitId: string): string {
  const tag = `${REF_TAG_PREFIX}${exhibitId.toLowerCase()}`;
  if (tag.length > 64) {
    throw new Error("Die Beilagen-ID passt nicht in den Tag des Inhaltssteuerelements.");
  }
  return tag;
}

export function parseReferenceTag(tag: string | null | undefined): string | null {
  if (!tag || !tag.startsWith(REF_TAG_PREFIX)) return null;
  const id = tag.slice(REF_TAG_PREFIX.length).toLowerCase();
  return isExhibitId(id) ? id : null;
}

export function isDirectoryTag(tag: string | null | undefined): boolean {
  return tag === DIRECTORY_TAG;
}
