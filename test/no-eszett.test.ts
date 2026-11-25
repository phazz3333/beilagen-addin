import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const roots = ["src", "docs", "test"];
const files = ["README.md", "taskpane.html", "manifest.xml"];

describe("Schweizer Schreibweise", () => {
  it("verwendet kein Eszett in Texten des Add-ins", () => {
    const hits: string[] = [];
    for (const file of files) collect(file, hits);
    for (const root of roots) walk(root, hits);
    expect(hits).toEqual([]);
  });
});

function walk(directory: string, hits: string[]): void {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, hits);
    else collect(path, hits);
  }
}

function collect(path: string, hits: string[]): void {
  if (!/\.(ts|tsx|css|md|html|xml)$/.test(path)) return;
  const text = readFileSync(path, "utf8");
  if (text.includes(String.fromCharCode(0xdf))) hits.push(path);
}
