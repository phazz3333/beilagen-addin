import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

function resolveBase(): string {
  const raw = process.env.VITE_BASE?.trim();
  if (!raw || raw === "." || raw === "./") return "./";
  return raw.endsWith("/") ? raw : `${raw}/`;
}
const certFile = path.join(root, "certs", "dev-cert.pem");
const keyFile = path.join(root, "certs", "dev-key.pem");

export default defineConfig(({ command }) => {
  const https =
    command === "serve" && fs.existsSync(certFile) && fs.existsSync(keyFile)
      ? {
          cert: fs.readFileSync(certFile),
          key: fs.readFileSync(keyFile),
        }
      : undefined;

  return {
    plugins: [react()],
    base: resolveBase(),
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(root, "taskpane.html"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 4301,
      strictPort: true,
      https,
      allowedHosts: true,
    },
    preview: {
      host: "0.0.0.0",
      port: 4301,
      strictPort: true,
      https,
      allowedHosts: true,
    },
  };
});
