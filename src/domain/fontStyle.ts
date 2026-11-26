/** Einheitliche Zeichenformatierung. null bedeutet gemischt oder nicht gesetzt. */
export interface FontStyle {
  bold: boolean | null;
  italic: boolean | null;
  name: string | null;
  size: number | null;
  color: string | null;
  underline: string | null;
}

export const EMPTY_FONT: FontStyle = {
  bold: null,
  italic: null,
  name: null,
  size: null,
  color: null,
  underline: null,
};

/** Nur eindeutige Werte werden nach einem Textersatz wieder gesetzt. */
export function reapplicableFont(style: FontStyle): Partial<FontStyle> {
  const next: Partial<FontStyle> = {};
  if (typeof style.bold === "boolean") next.bold = style.bold;
  if (typeof style.italic === "boolean") next.italic = style.italic;
  if (typeof style.name === "string" && style.name.trim()) next.name = style.name;
  if (typeof style.size === "number" && Number.isFinite(style.size) && style.size > 0) next.size = style.size;
  if (typeof style.color === "string" && style.color.trim()) next.color = style.color;
  if (typeof style.underline === "string" && style.underline.trim()) next.underline = style.underline;
  return next;
}
