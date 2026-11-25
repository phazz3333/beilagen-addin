import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryHost } from "../office/memoryHost";
import { WordHost } from "../office/wordHost";
import { App } from "./App";
import { musterState } from "./muster";
import "./styles.css";

const muster = window.location.hash === "#muster";

function wordApiVersion(): string | null {
  if (typeof Office === "undefined" || !Office.context?.requirements?.isSetSupported) return null;
  const versions = ["1.9", "1.8", "1.7", "1.6", "1.5", "1.4", "1.3", "1.2", "1.1"];
  return versions.find((version) => Office.context.requirements.isSetSupported("WordApi", version)) ?? null;
}

function mount(inWord: boolean): void {
  const root = document.getElementById("root");
  if (!root) return;
  const host = inWord ? new WordHost() : new MemoryHost(muster ? musterState() : undefined);
  createRoot(root).render(
    <StrictMode>
      <App host={host} muster={muster && !inWord} wordApi={inWord ? wordApiVersion() : null} />
    </StrictMode>,
  );
}

if (muster) {
  mount(false);
} else if (typeof Office !== "undefined" && typeof Office.onReady === "function") {
  Office.onReady((info) => {
    mount(info.host === Office.HostType.Word);
  });
} else {
  mount(false);
}
