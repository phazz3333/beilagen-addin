import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const origin = process.argv[2];
if (!origin || !/^https:\/\/[^/]+/i.test(origin)) {
  console.error("Aufruf: node scripts/set-host.mjs https://host/pfad [zieldatei]");
  process.exit(1);
}

const clean = origin.replace(/\/$/, "");
const xml = readFileSync("manifest.xml", "utf8").replaceAll("https://localhost:4301", clean);
const out = process.argv[3] || "dist/manifest.xml";
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, xml);
console.log(`${out} verwendet ${clean}`);
