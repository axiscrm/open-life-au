#!/usr/bin/env node
/**
 * Put release-please's version marker back on `info.version` in a bundled `dist/<name>/openapi.yaml`.
 *
 * release-please bumps `info.version` in the source `openapi.yaml`, but `dist/` is a committed build
 * of it, and CI fails a release PR whose `dist/` disagrees with the source. So release-please has to
 * bump `dist/` in the same commit — see the `/dist/...` entries in `release-please-config.json`.
 *
 * The JSON bundle takes release-please's `json` updater, which rewrites it byte-for-byte as
 * `redocly bundle` would. Its `yaml` updater does not: it re-serialises the whole document and
 * reformats it. The line-based generic updater is exact, but only touches lines carrying
 * `x-release-please-version` — and `redocly bundle` strips the comment the source has. This puts it
 * back, so the committed bundle carries the marker and the generic updater can find the line.
 *
 * Usage: node scripts/mark-dist-version.mjs <contract>...   (after `redocly bundle`)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ROOT, contracts } from "./contracts.mjs";

const MARKER = " # x-release-please-version";
const names = process.argv.slice(2);
if (!names.length) {
    console.error("usage: node scripts/mark-dist-version.mjs <contract>...");
    process.exit(2);
}

for (const name of names) {
    const contract = contracts().find((c) => c.name === name);
    if (!contract) throw new Error(`unknown contract: ${name}`);

    const lines = fs.readFileSync(contract.bundle, "utf8").split("\n");
    const info = lines.indexOf("info:");
    // The first two-space-indented `version:` under the top-level `info:` key, before the next
    // top-level key. Anything else named `version` sits deeper and is left alone.
    let hit = -1;
    for (let i = info + 1; info >= 0 && i < lines.length && !/^\S/.test(lines[i]); i++) {
        if (/^ {2}version: \S+$/.test(lines[i].replace(MARKER, ""))) {
            hit = i;
            break;
        }
    }
    if (hit < 0) {
        throw new Error(`${path.relative(ROOT, contract.bundle)}: no info.version line to mark`);
    }
    if (!lines[hit].endsWith(MARKER)) lines[hit] += MARKER;
    fs.writeFileSync(contract.bundle, lines.join("\n"));
}
