# Beilagen

Word-Add-in für Balthasar Legal AG. Es setzt Beilagenverweise in eine Rechtsschrift, nummeriert sie nach der ersten Nennung, führt das Beweismittelverzeichnis und stempelt die Beilagen-PDFs in ein ZIP.

Alles läuft im Aufgabenbereich. Es gibt kein Backend und keine Telemetrie. PDFs werden lokal im Browser gestempelt (pdf-lib und JSZip, beide MIT).

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev
```

Der Entwicklungs-Server hört auf [https://localhost:4301/taskpane.html](https://localhost:4301/taskpane.html). Beim ersten Start legt `npm run dev` ein Zertifikat unter `certs/` an. Word lädt den Aufgabenbereich nur, wenn dieses Zertifikat vertraut wird. Anleitung: [docs/installation.md](docs/installation.md).

```bash
npm test
npm run build
```

`npm run build` prüft die Typen, schreibt `dist/` und kopiert `manifest.xml` daneben. Für ein anderes Hosting die Adressen ersetzen:

```bash
npm run manifest:host -- https://example.org/beilagen dist/manifest.xml
```

## Inhalt

- `manifest.xml` – Sideload, zeigt auf localhost
- `src/domain` – Nummerierung, Dateinamen, Speicherformat, Verzeichnis
- `src/pdf` – Stempel und ZIP
- `src/office` – Word (Inhaltssteuerelemente, Custom XML)
- `docs/installation.md` – Sideload unter Windows, auch ARM64, und Microsoft 365 Admin Center
- `docs/bedienung.md` – Ablauf in der Rechtsschrift

Die Tests verwenden nur selbst erzeugte Musterdokumente und Muster-PDFs.
