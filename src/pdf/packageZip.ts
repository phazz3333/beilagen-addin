import JSZip from "jszip";
import { directoryModel } from "../domain/directory";
import { DIRECTORY_PDF_NAME, exhibitFileName, packageZipName } from "../domain/filenames";
import { stampLabel } from "../domain/labels";
import type { BeilagenState } from "../domain/types";
import { buildDirectoryPdf } from "./evidencePdf";
import { describePdfError, stampFirstPage } from "./stamp";

export interface PackageFile {
  name: string;
  bytes: Uint8Array;
}

const MAX_BYTES = 80 * 1024 * 1024;

export async function createExhibitPackage(
  state: BeilagenState,
  files: ReadonlyMap<string, Uint8Array>,
  onProgress?: (done: number, total: number) => void,
): Promise<{ fileName: string; bytes: Uint8Array; entries: string[] }> {
  if (!state.abbreviation) {
    throw new Error("Zuerst das Kürzel der Rechtsschrift wählen.");
  }
  const numbered = state.exhibits
    .filter((exhibit) => exhibit.number > 0)
    .slice()
    .sort((a, b) => a.number - b.number);
  if (numbered.length === 0) {
    throw new Error("Keine nummerierte Beilage. Zuerst einen Verweis einfügen.");
  }

  const missing = numbered.filter((exhibit) => !files.has(exhibit.id));
  if (missing.length > 0) {
    const lines = missing.map(
      (exhibit) => `${state.abbreviation} ${exhibit.number} ${exhibit.title}`,
    );
    throw new Error(`Diese Beilagen haben noch kein PDF:\n${lines.join("\n")}`);
  }

  const stamped: PackageFile[] = [];
  for (let index = 0; index < numbered.length; index += 1) {
    const exhibit = numbered[index];
    const source = files.get(exhibit.id)!;
    const label = stampLabel(state.abbreviation, exhibit.number);
    const name = exhibitFileName(state.abbreviation, exhibit.number, exhibit.title);
    if (source.byteLength > MAX_BYTES) {
      throw new Error(`«${name}» ist grösser als 80 MB und wird nicht gestempelt.`);
    }
    let bytes: Uint8Array;
    try {
      bytes = await stampFirstPage(source, label);
    } catch (error) {
      throw new Error(describePdfError(error, name));
    }
    stamped.push({ name, bytes });
    onProgress?.(index + 1, numbered.length);
  }

  const directory = await buildDirectoryPdf(directoryModel(state));
  const entries = [DIRECTORY_PDF_NAME, ...stamped.map((file) => file.name)];
  const zip = new JSZip();
  zip.file(DIRECTORY_PDF_NAME, directory);
  for (const file of stamped) zip.file(file.name, file.bytes);
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  return { fileName: packageZipName(state.abbreviation), bytes, entries };
}
