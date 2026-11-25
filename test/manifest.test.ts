import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PAGES = "https://phazz3333.github.io/beilagen-addin";
const ID = "5fcb297d-8f1e-42cf-8732-3cfe89e5fd56";

describe("Manifeste", () => {
  const dev = readFileSync("manifest.xml", "utf8");
  const production = readFileSync("manifest.production.xml", "utf8");

  it("behält ID und Version 1.0.0.0", () => {
    for (const xml of [dev, production]) {
      expect(xml).toContain(`<Id>${ID}</Id>`);
      expect(xml).toContain("<Version>1.0.0.0</Version>");
    }
  });

  it("zeigt lokal auf localhost und in der Testrunde auf GitHub Pages", () => {
    expect(dev).toContain("https://localhost:4301/taskpane.html");
    expect(dev).not.toContain(PAGES);

    expect(production).not.toContain("localhost");
    expect(production).toContain(`${PAGES}/taskpane.html`);
    expect(production).toContain(`${PAGES}/assets/icon-16.png`);
    expect(production).toContain(`${PAGES}/assets/icon-32.png`);
    expect(production).toContain(`${PAGES}/assets/icon-64.png`);
    expect(production).toContain(`${PAGES}/assets/icon-80.png`);
    expect(production).toContain(`<AppDomain>${PAGES}</AppDomain>`);
    expect(production).toContain(`<SupportUrl DefaultValue="${PAGES}/taskpane.html"/>`);
  });
});
