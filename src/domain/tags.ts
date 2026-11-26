import {
  DESCRIPTION_TAG_PREFIX,
  DIRECTORY_TAG,
  NUMBER_TAG_PREFIX,
  REF_TAG_PREFIX,
  isExhibitId,
} from "./types";

function taggedId(prefix: string, exhibitId: string): string {
  const tag = `${prefix}${exhibitId.toLowerCase()}`;
  if (tag.length > 64) {
    throw new Error("Die Beilagen-ID passt nicht in den Tag des Inhaltssteuerelements.");
  }
  return tag;
}

function parseTaggedId(prefix: string, tag: string | null | undefined): string | null {
  if (!tag || !tag.startsWith(prefix)) return null;
  const id = tag.slice(prefix.length).toLowerCase();
  return isExhibitId(id) ? id : null;
}

export function referenceTag(exhibitId: string): string {
  return taggedId(REF_TAG_PREFIX, exhibitId);
}

export function numberTag(exhibitId: string): string {
  return taggedId(NUMBER_TAG_PREFIX, exhibitId);
}

export function descriptionTag(exhibitId: string): string {
  return taggedId(DESCRIPTION_TAG_PREFIX, exhibitId);
}

export function parseReferenceTag(tag: string | null | undefined): string | null {
  return parseTaggedId(REF_TAG_PREFIX, tag);
}

export function parseNumberTag(tag: string | null | undefined): string | null {
  return parseTaggedId(NUMBER_TAG_PREFIX, tag);
}

export function parseDescriptionTag(tag: string | null | undefined): string | null {
  return parseTaggedId(DESCRIPTION_TAG_PREFIX, tag);
}

export function isDirectoryTag(tag: string | null | undefined): boolean {
  return tag === DIRECTORY_TAG;
}
