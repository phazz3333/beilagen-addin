import { useEffect, useId, useState } from "react";
import { buildCitation, referenceLabelPlain } from "../domain/labels";
import {
  ABBREVIATION_NAMES,
  ABBREVIATIONS,
  emptyState,
  isPresetPrefix,
  sanitizePrefix,
  type BeilagenState,
  type CitationOrder,
  type Exhibit,
} from "../domain/types";
import { matchPdfFiles } from "../domain/matchPdfs";
import type { BeilagenHost, TrackingState } from "../office/host";
import {
  changeAbbreviation,
  changeCitationOrder,
  insertExistingExhibit,
  insertNewExhibit,
  placeDirectory,
  removeExhibit,
  renumberDocument,
  updateExhibit,
} from "./actions";
import { downloadBytes } from "./download";
import { MUSTER_IDS } from "./muster";

interface AppProps {
  host: BeilagenHost;
  muster: boolean;
  wordApi: string | null;
}

interface StoredPdf {
  name: string;
  bytes: Uint8Array;
}

interface ReadyZip {
  fileName: string;
  bytes: Uint8Array;
}

const MAX_PDF = 80 * 1024 * 1024;

export function App({ host, muster, wordApi }: AppProps) {
  const titleId = useId();
  const prefixId = useId();
  const [state, setState] = useState<BeilagenState>(emptyState());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [pendingAbbr, setPendingAbbr] = useState<string | null>(null);
  const [pendingOrder, setPendingOrder] = useState<CitationOrder | null>(null);
  const [customDraft, setCustomDraft] = useState("");
  const [directoryPresent, setDirectoryPresent] = useState(false);
  const [tracking, setTracking] = useState<TrackingState>("unknown");
  const [files, setFiles] = useState<Map<string, StoredPdf>>(new Map());
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [readyZip, setReadyZip] = useState<ReadyZip | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    host
      .load()
      .then(async (loaded) => {
        if (cancelled) return;
        let current = loaded;
        if (host.inWord && loaded.abbreviation) {
          try {
            current = (await renumberDocument(host, loaded)).state;
          } catch {
            current = loaded;
          }
        }
        if (cancelled) return;
        setState(current);
        const [count, track] = await Promise.all([host.directoryCount(), host.tracking()]);
        if (cancelled) return;
        setDirectoryPresent(count > 0);
        setTracking(track);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoadError(reason instanceof Error ? reason.message : "Das Dokument konnte nicht gelesen werden.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [host, reloadKey]);

  useEffect(() => {
    if (!muster) return;
    let cancelled = false;
    import("../pdf/minimalPdf")
      .then(({ buildMinimalPdf }) => buildMinimalPdf())
      .then((bytes) => {
        if (cancelled) return;
        setFiles((current) => {
          const next = new Map(current);
          next.set(MUSTER_IDS.vertrag, { name: "Kaufvertrag-Muster.pdf", bytes });
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [muster]);

  async function run(work: () => Promise<{ state: BeilagenState; status: string; warning?: string; directoryPresent: boolean }>) {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const result = await work();
      setState(result.state);
      setStatus(result.status);
      setWarning(result.warning ?? null);
      setDirectoryPresent(result.directoryPresent);
      setFiles((current) => {
        const ids = new Set(result.state.exhibits.map((exhibit) => exhibit.id));
        const next = new Map<string, StoredPdf>();
        for (const [id, file] of current) {
          if (ids.has(id)) next.set(id, file);
        }
        return next;
      });
    } catch (reason) {
      setStatus(null);
      setError(reason instanceof Error ? reason.message : "Die Aktion ist fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (state.abbreviation && !isPresetPrefix(state.abbreviation)) setCustomDraft(state.abbreviation);
    else setCustomDraft("");
  }, [state.abbreviation]);

  function chooseAbbreviation(next: string) {
    if (next === state.abbreviation) {
      setPendingAbbr(null);
      return;
    }
    if (state.abbreviation && state.exhibits.length > 0) {
      setPendingAbbr(next);
      return;
    }
    void run(() => changeAbbreviation(host, state, next));
  }

  function chooseOrder(next: CitationOrder) {
    if (next === state.citationOrder) {
      setPendingOrder(null);
      return;
    }
    if (state.exhibits.length > 0) {
      setPendingOrder(next);
      return;
    }
    void run(() => changeCitationOrder(host, state, next));
  }

  function applyCustomPrefix() {
    const prefix = sanitizePrefix(customDraft);
    if (!prefix) {
      setError("Das eigene Kürzel darf Buchstaben, Ziffern, Punkt und Bindestrich enthalten, höchstens 12 Zeichen.");
      return;
    }
    chooseAbbreviation(prefix);
  }

  async function onPickFile(exhibitId: string, list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    if (file.size > MAX_PDF) {
      setError(`«${file.name}» ist grösser als 80 MB.`);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError(`«${file.name}» ist kein PDF.`);
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    setFiles((current) => {
      const next = new Map(current);
      next.set(exhibitId, { name: file.name, bytes });
      return next;
    });
    setError(null);
    setStatus(`PDF zugeordnet: ${file.name}`);
    setReadyZip(null);
  }

  async function onPickMany(list: FileList | null) {
    if (!list || list.length === 0 || !state.abbreviation) return;
    const incoming = Array.from(list);
    const { matches, unmatched } = matchPdfFiles(
      incoming.map((file) => file.name),
      state.abbreviation,
      state.exhibits,
    );
    const byName = new Map(incoming.map((file) => [file.name, file]));
    const next = new Map(files);
    let assigned = 0;
    for (const match of matches) {
      const file = byName.get(match.fileName);
      if (!file) continue;
      if (file.size > MAX_PDF) {
        unmatched.push(match.fileName);
        continue;
      }
      next.set(match.exhibitId, { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      assigned += 1;
    }
    setFiles(next);
    setReadyZip(null);
    const missed = unmatched.length > 0 ? `, ${unmatched.length} nicht erkannt` : "";
    setStatus(`${assigned} ${assigned === 1 ? "PDF zugeordnet" : "PDFs zugeordnet"}${missed}.`);
    setError(unmatched.length > 0 ? `Nicht zugeordnet: ${unmatched.join(", ")}` : null);
  }

  async function onPackage() {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const bytes = new Map<string, Uint8Array>();
      for (const [id, file] of files) bytes.set(id, file.bytes);
      const { createExhibitPackage } = await import("../pdf/packageZip");
      const result = await createExhibitPackage(state, bytes, (done, total) => {
        setStatus(`Stemple ${done} von ${total}…`);
      });
      setReadyZip({ fileName: result.fileName, bytes: result.bytes });
      downloadBytes(result.bytes, result.fileName, "application/zip");
      setStatus(`Paket bereit: ${result.fileName}`);
    } catch (reason) {
      setStatus(null);
      setError(reason instanceof Error ? reason.message : "Das Paket konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  const numbered = state.exhibits.filter((exhibit) => exhibit.number > 0);
  const missing = numbered.filter((exhibit) => !files.has(exhibit.id)).length;

  return (
    <div className="app">
      <header className="brand">
        <span className="mark" aria-hidden="true">BL</span>
        <div>
          <p className="brand-name">Balthasar Legal</p>
          <h1>Beilagen</h1>
        </div>
      </header>

      {muster ? (
        <p className="banner info">Musterdaten zur Ansicht. Keine Mandantendaten. In Word wird der Stand im Dokument gespeichert.</p>
      ) : null}
      {!host.inWord && !muster ? (
        <p className="banner info">Dieses Fenster läuft ausserhalb von Word. Verweise werden hier nur zum Ausprobieren gehalten.</p>
      ) : null}
      {error ? <p className="banner error" role="alert">{error}</p> : null}
      {warning ? <p className="banner warn" role="status">{warning}</p> : null}
      {status && !error ? <p className="banner ok" role="status">{status}</p> : null}

      {loading ? <section className="card"><p className="hint">Dokument wird gelesen…</p></section> : null}
      {loadError ? (
        <section className="card">
          <p className="banner error" role="alert">{loadError}</p>
          <button type="button" className="primary" onClick={() => setReloadKey((value) => value + 1)}>Erneut versuchen</button>
        </section>
      ) : null}

      {!loading && !loadError ? (
        <>
          <section className="card" aria-labelledby="kuerzel-title">
            <h2 id="kuerzel-title">Rechtsschrift</h2>
            <div className="segmented" role="radiogroup" aria-label="Kürzel der Rechtsschrift">
              {ABBREVIATIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="radio"
                  aria-checked={state.abbreviation === item}
                  disabled={busy}
                  onClick={() => chooseAbbreviation(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <label className="field" htmlFor={prefixId}>Eigenes Kürzel</label>
            <div className="row">
              <input
                id={prefixId}
                value={customDraft}
                maxLength={12}
                disabled={busy}
                placeholder="z. B. BV"
                onChange={(event) => setCustomDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyCustomPrefix();
                  }
                }}
              />
              <button type="button" className="secondary" disabled={busy || customDraft.trim() === ""} onClick={applyCustomPrefix}>
                Übernehmen
              </button>
            </div>
            <p className="hint">
              {state.abbreviation
                ? `${prefixHint(state.abbreviation)} Wird im Dokument gespeichert.`
                : "Kürzel wählen oder ein eigenes eingeben. Es wird im Dokument gespeichert."}
            </p>
            <form
              className="stack"
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  const result = await insertNewExhibit(host, state, { title });
                  setTitle("");
                  return result;
                });
              }}
            >
              <label htmlFor={titleId}>Bezeichnung</label>
              <input
                id={titleId}
                value={title}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Kaufvertrag vom 3. März 2025"
              />
              <p className="hint">Reihenfolge im Verweis</p>
              <div className="segmented order" role="radiogroup" aria-label="Reihenfolge im Verweis">
                <button type="button" role="radio" aria-checked={state.citationOrder === "number-first"} disabled={busy} onClick={() => chooseOrder("number-first")}>
                  Nummer zuerst
                </button>
                <button type="button" role="radio" aria-checked={state.citationOrder === "description-first"} disabled={busy} onClick={() => chooseOrder("description-first")}>
                  Bezeichnung zuerst
                </button>
              </div>
              <p className="preview">{previewCitation(state.abbreviation, state.citationOrder, title)}</p>
              <button type="submit" className="primary" disabled={busy || !state.abbreviation || title.trim() === ""}>
                {host.inWord ? "Am Cursor einfügen" : "Beilage erfassen"}
              </button>
            </form>
            {pendingAbbr ? (
              <div className="confirm">
                <p>Kürzel auf {prefixHint(pendingAbbr)} ändern? Alle Verweise werden angepasst.</p>
                <div className="row">
                  <button type="button" className="primary" disabled={busy} onClick={() => {
                    const next = pendingAbbr;
                    setPendingAbbr(null);
                    void run(() => changeAbbreviation(host, state, next));
                  }}>Ändern</button>
                  <button type="button" className="secondary" onClick={() => setPendingAbbr(null)}>Abbrechen</button>
                </div>
              </div>
            ) : null}
            {pendingOrder ? (
              <div className="confirm">
                <p>Reihenfolge ändern? Die Verweise im Text werden neu geschrieben. Einheitliche Zeichenformatierung bleibt erhalten.</p>
                <div className="row">
                  <button type="button" className="primary" disabled={busy} onClick={() => {
                    const next = pendingOrder;
                    setPendingOrder(null);
                    void run(() => changeCitationOrder(host, state, next));
                  }}>Ändern</button>
                  <button type="button" className="secondary" onClick={() => setPendingOrder(null)}>Abbrechen</button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="card">
            <h2>Bestehende Beilage</h2>
            <ExistingList
              state={state}
              busy={busy}
              onInsert={(id) => void run(() => insertExistingExhibit(host, state, id))}
            />
          </section>

          <section className="card">
            <h2>Nummerierung</h2>
            <div className="stack">
              <button type="button" className="primary" disabled={busy || !state.abbreviation} onClick={() => void run(() => renumberDocument(host, state))}>
                Neu nummerieren
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || !host.inWord || !state.abbreviation}
                onClick={() => void run(() => placeDirectory(host, state))}
              >
                {directoryPresent ? "Verzeichnis aktualisieren" : "Verzeichnis einfügen"}
              </button>
            </div>
            <p className="hint">
              Nummern folgen der ersten Nennung. Nach dem Verschieben von Text neu nummerieren.
              {!host.inWord ? " Das Verzeichnis wird in Word an der Cursorposition eingefügt." : " Ein bestehendes Verzeichnis wird an Ort ersetzt, manuelle Ergänzungen darin gehen verloren."}
            </p>
            <p className="hint">Gemäss Art. 221 Abs. 2 lit. d ZPO: Nummer und Bezeichnung.</p>
            <details className="disclosure" open={tracking === "on"}>
              <summary>Änderungsverfolgung</summary>
              <p>
                {tracking === "on" ? "Die Änderungsverfolgung ist eingeschaltet. " : ""}
                Die neue Nummer erscheint dann als nachverfolgte Änderung. Die Beilagen-ID im Verweis bleibt stabil.
                Ein noch nicht angenommener, als gelöscht markierter Verweis wird ab WordApi 1.4 nicht mehr mitgezählt.
                Das Add-in schaltet die Nachverfolgung nicht aus.
              </p>
            </details>
          </section>

          <section className="card">
            <h2>PDFs und Paket</h2>
            <p className="hint">Die Dateien bleiben in diesem Fenster. Nichts wird hochgeladen.</p>
            {state.exhibits.length === 0 ? <p className="empty">Beilagen erscheinen hier, sobald ein Verweis eingefügt wurde.</p> : null}
            <ul className="exhibits">
              {state.exhibits.map((exhibit) => (
                <ExhibitRow
                  key={exhibit.id}
                  exhibit={exhibit}
                  abbreviation={state.abbreviation}
                  citationOrder={state.citationOrder}
                  file={files.get(exhibit.id)}
                  busy={busy}
                  editing={editing === exhibit.id}
                  editTitle={editTitle}
                  onEdit={() => {
                    setEditing(exhibit.id);
                    setEditTitle(exhibit.title);
                  }}
                  onCancel={() => setEditing(null)}
                  onEditTitle={setEditTitle}
                  onSave={() => {
                    void run(async () => {
                      const result = await updateExhibit(host, state, exhibit.id, { title: editTitle });
                      setEditing(null);
                      return result;
                    });
                  }}
                  onRemove={() => void run(() => removeExhibit(host, state, exhibit.id))}
                  onFile={(list) => void onPickFile(exhibit.id, list)}
                  onClear={() => {
                    setFiles((current) => {
                      const next = new Map(current);
                      next.delete(exhibit.id);
                      return next;
                    });
                    setReadyZip(null);
                  }}
                />
              ))}
            </ul>
            <label className={`drop ${busy || !state.abbreviation ? "disabled" : ""}`}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                disabled={busy || !state.abbreviation}
                onChange={(event) => {
                  void onPickMany(event.target.files);
                  event.target.value = "";
                }}
              />
              <span>Mehrere PDFs wählen</span>
              <span className="hint">Dateinamen wie «{state.abbreviation ?? "KB"} 01 - Vertrag.pdf» werden zugeordnet.</span>
            </label>
            <button type="button" className="primary" disabled={busy || numbered.length === 0} onClick={() => void onPackage()}>
              Paket erstellen{missing === 1 ? " (1 PDF fehlt)" : missing > 1 ? ` (${missing} PDFs fehlen)` : ""}
            </button>
            {readyZip ? (
              <button
                type="button"
                className="secondary"
                onClick={() => downloadBytes(readyZip.bytes, readyZip.fileName, "application/zip")}
              >
                ZIP speichern
              </button>
            ) : null}
            <p className="note">
              Der Stempel steht nur auf der ersten Seite, oben rechts auf einem weissen Feld. Eine Beilage im PDF/A-Format ist nach dem Stempeln nicht garantiert PDF/A-konform. Keine Deckblätter, kein Sammel-PDF.
            </p>
          </section>
        </>
      ) : null}

      <footer>
        <p>Lokal im Browser. Kein Server, keine Telemetrie.</p>
        <p>Office.js wird von Microsoft geladen. Dokumente und PDFs bleiben auf diesem Rechner.</p>
        <p>Version 1.0.0{wordApi ? ` · WordApi ${wordApi}` : ""}</p>
      </footer>
    </div>
  );
}

function ExistingList({
  state,
  busy,
  onInsert,
}: {
  state: BeilagenState;
  busy: boolean;
  onInsert: (id: string) => void;
}) {
  if (state.exhibits.length === 0) return <p className="empty">Noch keine Beilage erfasst.</p>;
  return (
    <ul className="existing-list">
      {state.exhibits.map((exhibit) => (
        <li key={exhibit.id}>
          <button type="button" className="existing" disabled={busy || !state.abbreviation} onClick={() => onInsert(exhibit.id)}>
            <span className="pill">{exhibit.number > 0 && state.abbreviation ? referenceLabelPlain(state.abbreviation, exhibit.number) : "ohne Nr."}</span>
            <span className="existing-copy">
              <span className="title">{exhibit.title}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ExhibitRow({
  exhibit,
  abbreviation,
  citationOrder,
  file,
  busy,
  editing,
  editTitle,
  onEdit,
  onCancel,
  onEditTitle,
  onSave,
  onRemove,
  onFile,
  onClear,
}: {
  exhibit: Exhibit;
  abbreviation: string | null;
  citationOrder: CitationOrder;
  file: StoredPdf | undefined;
  busy: boolean;
  editing: boolean;
  editTitle: string;
  onEdit: () => void;
  onCancel: () => void;
  onEditTitle: (value: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onFile: (list: FileList | null) => void;
  onClear: () => void;
}) {
  const inputId = useId();
  const [confirming, setConfirming] = useState(false);
  const label = exhibit.number > 0 && abbreviation ? referenceLabelPlain(abbreviation, exhibit.number) : "ohne Nr.";
  return (
    <li className="exhibit">
      <div className="exhibit-main">
        <span className="pill">{label}</span>
        <div className="existing-copy">
          <span className="title">
            {abbreviation && exhibit.number > 0
              ? buildCitation(abbreviation, exhibit.number, exhibit.title, citationOrder).plain.replaceAll("\u00A0", " ")
              : exhibit.title}
          </span>
          <span className={file ? "file-ok" : "file-miss"}>{file ? file.name : "PDF fehlt"}</span>
        </div>
      </div>
      <div className="exhibit-actions">
        <label className="file-button" htmlFor={inputId}>PDF wählen</label>
        <input
          id={inputId}
          className="sr"
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(event) => {
            onFile(event.target.files);
            event.target.value = "";
          }}
        />
        {file ? <button type="button" className="text" disabled={busy} onClick={onClear}>PDF entfernen</button> : null}
        <button type="button" className="text" disabled={busy} onClick={onEdit}>Bearbeiten</button>
        <button type="button" className="text danger" disabled={busy} onClick={() => setConfirming(true)}>Entfernen</button>
      </div>
      {confirming ? (
        <div className="confirm">
          <p>Beilage entfernen? Alle Verweise im Text werden gelöscht.</p>
          <div className="row">
            <button type="button" className="primary" disabled={busy} onClick={onRemove}>Entfernen</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Abbrechen</button>
          </div>
        </div>
      ) : null}
      {editing ? (
        <form
          className="edit"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label>Bezeichnung
            <input value={editTitle} maxLength={200} onChange={(event) => onEditTitle(event.target.value)} />
          </label>
          <div className="row">
            <button type="submit" className="primary" disabled={busy || editTitle.trim() === ""}>Übernehmen</button>
            <button type="button" className="secondary" onClick={onCancel}>Abbrechen</button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function prefixHint(prefix: string): string {
  return isPresetPrefix(prefix) ? `${prefix} (${ABBREVIATION_NAMES[prefix]})` : prefix;
}

function previewCitation(prefix: string | null, order: CitationOrder, description: string): string {
  if (!prefix) return "Zuerst ein Kürzel wählen.";
  const sample = description.trim() || "Kaufvertrag vom 3. März 2025";
  return buildCitation(prefix, 1, sample, order).plain.replaceAll("\u00A0", " ");
}
