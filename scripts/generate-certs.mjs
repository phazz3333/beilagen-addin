import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const dir = path.resolve("certs");
const cert = path.join(dir, "dev-cert.pem");
const key = path.join(dir, "dev-key.pem");

if (existsSync(cert) && existsSync(key)) {
  console.log("Zertifikat vorhanden:", cert);
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "825",
    "-nodes",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ],
  { stdio: "inherit" },
);
console.log("Zertifikat erzeugt:", cert);
