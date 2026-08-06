#!/usr/bin/env node
/**
 * Provenance gate — nothing in this contract may be derived from a third-party aggregator's
 * specification.
 *
 * The standard is modelled on the questions an adviser answers, and its occupation baseline comes
 * from the ABS. Two things follow, and this script enforces both:
 *
 *   1. Copying field names, enum values or wording out of a licensed vendor specification would put
 *      that material into a public repository.
 *   2. It would also re-import the vendor shape the standard exists to replace, and it would
 *      undermine the claim that the occupation baseline is ABS-derived — a claim that has to be
 *      demonstrable, not merely asserted.
 *
 * Discovering WHICH concepts matter from an existing integration is legitimate and expected.
 * Carrying a name, string, code or structure across is not.
 *
 * Usage: node scripts/check-provenance.mjs
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

/** Directories that become published artefacts. */
const SCANNED = ["core", "domains", "taxonomy", "dist", "postman", "reference-impl", "docs"];

/**
 * Vendor names and the section-symbol citation style that indicates text lifted from a vendor
 * specification. Case-insensitive.
 */
const FORBIDDEN = [
    { pattern: /omnium/i, why: "aggregator name" },
    { pattern: /omnilife/i, why: "aggregator name" },
    { pattern: /neos\b/i, why: "insurer-specific naming in a vendor-neutral contract" },
    { pattern: /§/, why: "section citation, indicating text taken from a vendor specification" },
];

/**
 * Files permitted to name an aggregator, because their subject IS the relationship to one. Kept
 * deliberately short — every entry is a place a reviewer has to check by hand.
 */
const ALLOWLIST = new Set([
    "docs/acord-relationship.md",
    "docs/PROVENANCE-RULES.md",
    "docs/neos-mcp-gap-analysis.md",
]);

const TEXT_EXT = new Set([".yaml", ".yml", ".json", ".md", ".js", ".mjs", ".ts", ".py"]);

function* walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(abs);
        else if (TEXT_EXT.has(path.extname(entry.name))) yield abs;
    }
}

let violations = 0;
let scanned = 0;

for (const top of SCANNED) {
    for (const abs of walk(path.join(ROOT, top))) {
        const rel = path.relative(ROOT, abs);
        if (ALLOWLIST.has(rel)) continue;
        scanned += 1;

        const lines = fs.readFileSync(abs, "utf8").split("\n");
        lines.forEach((line, i) => {
            for (const { pattern, why } of FORBIDDEN) {
                if (pattern.test(line)) {
                    violations += 1;
                    console.error(`✗ ${rel}:${i + 1}  ${why}`);
                    console.error(`    ${line.trim().slice(0, 140)}`);
                }
            }
        });
    }
}

if (violations > 0) {
    console.error(
        `\n${violations} provenance violation(s) across ${scanned} files.\n` +
            "See docs/PROVENANCE-RULES.md. Derive from the adviser's questions and the ABS " +
            "occupation baseline — never from a vendor specification.",
    );
    process.exit(1);
}

console.log(`✓ provenance clean (${scanned} files scanned)`);
