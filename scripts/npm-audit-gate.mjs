#!/usr/bin/env node
/**
 * npm-audit gate with a reviewed exceptions list.
 *
 * `npm audit --audit-level=…` is all-or-nothing: one advisory whose only fix is
 * a breaking major (e.g. react-router 8 needing a react bump) blocks every PR
 * with no way to accept the risk explicitly. This gate runs `npm audit --json`
 * and fails on any advisory at/above the threshold UNLESS it is listed in
 * scripts/npm-audit-exceptions.json — where each entry must carry a reason and
 * an `expires` date. An expired exception fails the gate again, so accepted
 * risk gets re-decided instead of rotting silently.
 *
 * Usage: node scripts/npm-audit-gate.mjs [--level moderate]
 * (run from the directory whose package tree should be audited — the monorepo
 * root in CI; the exceptions file always resolves relative to this script.)
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_FILE = path.join(__dirname, "npm-audit-exceptions.json");

const SEVERITIES = ["info", "low", "moderate", "high", "critical"];
const levelArg = process.argv.indexOf("--level");
const level = levelArg !== -1 ? process.argv[levelArg + 1] : "moderate";
const threshold = SEVERITIES.indexOf(level);
if (threshold === -1) {
  console.error(
    `Unknown --level "${level}" (expected one of ${SEVERITIES.join(", ")})`,
  );
  process.exit(2);
}

const { exceptions = [] } = JSON.parse(
  fs.readFileSync(EXCEPTIONS_FILE, "utf-8"),
);
const today = new Date().toISOString().slice(0, 10);
const active = new Map(); // GHSA id -> exception
const expired = [];
for (const e of exceptions) {
  if (e.expires && e.expires < today) expired.push(e);
  else active.set(e.advisory, e);
}

// npm audit exits 1 when it finds anything, so capture stdout instead of
// failing on the exit code.
let report;
try {
  report = execSync("npm audit --json", {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  report = err.stdout;
  if (!report) {
    console.error("npm audit produced no output:", err.message);
    process.exit(2);
  }
}

let audit;
try {
  audit = JSON.parse(report);
} catch {
  console.error("npm audit did not return JSON:\n" + report.slice(0, 500));
  process.exit(2);
}

// A non-zero exit does NOT mean the report is usable. When npm cannot reach the
// advisory endpoint it writes an error object to stdout — `{message, error}`,
// no `vulnerabilities` key — which parses perfectly well and would otherwise
// read as "nothing found" and pass the gate. A registry blip would then turn
// the nightly security job into a silent no-op. Insist on the markers a real
// report carries and fail closed: an audit we could not run is not a clean one.
if (audit.auditReportVersion === undefined || !audit.vulnerabilities) {
  const why = audit.message || audit.error?.summary || audit.error?.detail;
  console.error(
    `npm audit did not return a report${why ? `: ${why}` : ""}\n` +
      "The gate fails closed rather than reporting a tree it never audited — re-run it.",
  );
  process.exit(2);
}

// Each vulnerability's `via` mixes advisory objects (the package with the flaw)
// and plain strings (packages vulnerable only through a dependency). Gating on
// the advisory objects covers both: the string entries clear once their root
// advisory is fixed or excepted.
const offending = new Map(); // GHSA id -> {package, severity, title, url}
const accepted = new Map();
for (const vuln of Object.values(audit.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== "object") continue;
    if (SEVERITIES.indexOf(via.severity) < threshold) continue;
    const id = (via.url ?? "").split("/").pop() || `${via.name}:${via.title}`;
    const row = {
      package: via.name,
      severity: via.severity,
      title: via.title,
      url: via.url,
    };
    (active.has(id) ? accepted : offending).set(id, row);
  }
}

for (const [id, row] of accepted) {
  const e = active.get(id);
  console.log(
    `ACCEPTED  ${id} ${row.package} (${row.severity}) — ${e.reason.split(".")[0]}. Expires ${e.expires}.`,
  );
}
for (const e of expired) {
  console.error(
    `EXPIRED   ${e.advisory} ${e.package} — exception lapsed ${e.expires}; re-decide or fix.`,
  );
}
for (const [id, row] of offending) {
  console.error(
    `BLOCKING  ${id} ${row.package} (${row.severity}) — ${row.title} ${row.url}`,
  );
}

if (offending.size || expired.length) {
  console.error(
    `\nnpm-audit gate: ${offending.size} blocking advisor${offending.size === 1 ? "y" : "ies"}, ${expired.length} expired exception${expired.length === 1 ? "" : "s"}.`,
  );
  process.exit(1);
}
console.log(
  `npm-audit gate: clean at level "${level}" (${accepted.size} accepted exception${accepted.size === 1 ? "" : "s"}).`,
);
