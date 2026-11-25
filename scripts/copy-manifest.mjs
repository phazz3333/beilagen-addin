import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
copyFileSync("manifest.xml", "dist/manifest.xml");
console.log("dist/manifest.xml zeigt auf https://localhost:4301");
console.log("Für statisches Hosting: npm run manifest:host -- https://ihr-host/pfad");
