# Beilagen einrichten

Das Add-in ist ein Aufgabenbereich für Word. Es enthält keine native Komponente. Auf Windows on ARM64 (Snapdragon) läuft es wie auf jedem anderen Windows, im WebView2 von Word aus Microsoft 365. Ein separates ARM-Paket gibt es nicht. Word aus dem Microsoft Store bzw. Microsoft 365 muss installiert sein; das mitgelieferte WebView2 von Windows 11 genügt. Fehlt der Aufgabenbereich komplett und bleibt leer, das WebView2-Runtime in der ARM64-Fassung nachinstallieren.

Zwei Wege: der lokale Sideload gegen den Entwicklungs-Server, oder ein statischer Webserver (zum Beispiel GitHub Pages) plus Sideload oder zentrale Freigabe.

## 1. Lokal starten

```bash
npm install
npm run dev
```

Der Server bleibt offen. Er bedient `https://localhost:4301/taskpane.html` und die Symbole unter `https://localhost:4301/assets/`.

`certs/dev-cert.pem` einmalig als vertrauenswürdig speichern, sonst zeigt Word einen leeren Aufgabenbereich:

1. `certs/dev-cert.pem` auf den Windows-Rechner kopieren.
2. Doppelklick, «Zertifikat installieren».
3. Speicherort «Aktueller Benutzer».
4. «Alle Zertifikate in folgendem Speicher speichern» und «Vertrauenswürdige Stammzertifizierungsstellen» wählen.
5. Word neu starten.

Das Zertifikat gilt nur für `localhost`. Für die Kanzlei nicht weitergeben und nicht für ein öffentliches Hosting verwenden.

## 2. Sideload unter Windows

Microsoft beschreibt den Ablauf unter «Sideload Office Add-ins on Windows from a network share». Kurzfassung:

1. Einen Ordner anlegen, zum Beispiel `C:\Beilagen-Addin`.
2. `manifest.xml` aus diesem Projekt hineinkopieren. Die Adressen darin müssen erreichbar sein. Für den lokalen Versuch bleiben sie auf `https://localhost:4301`, und `npm run dev` muss laufen.
3. Den Ordner freigeben: Rechtsklick, Eigenschaften, Freigabe, sich selbst mindestens Lesen geben. Den UNC-Pfad notieren, zum Beispiel `\\NAME-DES-PCS\Beilagen-Addin`.
4. Word öffnen, Datei, Optionen, Trust Center, Einstellungen für das Trust Center, Vertrauenswürdige Add-In-Kataloge.
5. Den UNC-Pfad als Katalog-URL eintragen, «Katalog hinzufügen», «Im Menü anzeigen» aktivieren, mit OK bestätigen.
6. Word vollständig schliessen und neu öffnen.
7. Start, Add-Ins, Weitere Add-Ins. Oben «Freigegebener Ordner» wählen, Beilagen hinzufügen.
8. In der Registerkarte Start erscheint die Gruppe Beilagen. Der Knopf öffnet den Aufgabenbereich.

Die Bezeichnungen im Menü können je nach Word-Version leicht abweichen. Der Katalog heisst dort oft «SHARED FOLDER» oder «Freigegebener Ordner».

Ein Sideload über eine Netzwerkfreigabe ist nur für den Test gedacht, nicht für den produktiven Betrieb. Er funktioniert nur unter Windows. Wird die Gruppe im Menüband später geändert, muss jede Person das Add-in neu hinzufügen.

## 3. Statisches Hosting

Der Bau erzeugt eine statische Website in `dist/`:

```bash
npm run build
npm run manifest:host -- https://kanzlei.example/beilagen dist/manifest.xml
```

`dist/` auf den Webserver legen, sodass `https://kanzlei.example/beilagen/taskpane.html` und `https://kanzlei.example/beilagen/assets/icon-32.png` antworten. Das Manifest selbst wird nicht von Word vom Webserver geladen, sondern über den Katalog oder das Admin Center. Die Adressen *im* Manifest müssen auf den Webserver zeigen und HTTPS verwenden.

Bei GitHub Pages den Inhalt von `dist/` veröffentlichen und als Ursprung `https://<organisation>.github.io/<repository>` einsetzen. Projektseiten liegen in einem Unterpfad; der Befehl oben hängt keinen abschliessenden Schrägstrich an, die gebauten Dateien verwenden relative Pfade.

Danach dasselbe Sideload-Verfahren wie oben, aber mit dem erzeugten `dist/manifest.xml`. Der Entwicklungs-Server wird dafür nicht mehr gebraucht. Das Zertifikat aus `certs/` auch nicht.

Office.js lädt Word weiterhin von `https://appsforoffice.microsoft.com`. Das ist die Laufzeitbibliothek von Microsoft, keine Übermittlung der Rechtsschrift.

## 4. Zentrale Bereitstellung

Wenn die Kanzlei das Add-in für alle freigeben will:

1. Manifest mit den öffentlichen HTTPS-Adressen erzeugen (`npm run manifest:host`), nicht mit localhost.
2. Microsoft 365 Admin Center, Einstellungen, Integrierte Apps.
3. Benutzerdefinierte Apps hochladen, Typ Office-Add-In, die Manifest-Datei wählen.
4. Benutzer oder die ganze Organisation zuweisen.

Bis das Add-in in Word unter den vom Administrator bereitgestellten Add-Ins erscheint, können einige Stunden vergehen. Danach Start, Add-Ins, und Beilagen hinzufügen, falls es nicht schon sichtbar ist.

Eine neue Fassung: Version in `manifest.xml` erhöhen (`<Version>`), `dist/` neu bauen, Manifest-Adressen setzen, im Admin Center die App aktualisieren. Vite versieht das Skript mit einem Hash. Dennoch Word neu starten, wenn der Aufgabenbereich noch die alte Fassung zeigt.

## 5. Was das Add-in nicht mitliefert

Keine Anmeldung, keine Datenbank, kein Upload. Die Zuordnung der PDFs lebt nur im offenen Aufgabenbereich und steht nicht in der `.docx`. Das Kürzel und die Beilagenliste stehen als Custom XML im Dokument und reisen mit, wenn die Datei weitergegeben wird.
