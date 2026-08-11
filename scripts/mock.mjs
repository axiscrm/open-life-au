#!/usr/bin/env node
/**
 * Run a Prism mock of every contract at once, each on its own port.
 *
 * Prism serves one document per process, so "mock the standard" means three processes. That used to
 * be a single hard-coded script for quoting, which meant the README told an insurer evaluating the
 * policy contract to `npm run mock` and point a client at it — and they would have got a quoting
 * mock answering 404 to every policy path, with nothing explaining why.
 *
 * Usage:
 *   node scripts/mock.mjs                 every contract
 *   node scripts/mock.mjs policy          just one
 *
 * Ctrl-C stops all of them. Run `npm run bundle` first — mocks are served from `dist/`, because the
 * bundle has no cross-file `$ref`s left for Prism to resolve.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ROOT, contracts } from "./contracts.mjs";

const PRISM = path.join(ROOT, "node_modules", ".bin", "prism");
if (!fs.existsSync(PRISM)) {
    console.error("✗ prism is not installed. Run `npm ci` first.");
    process.exit(1);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const all = contracts();
const selected = wanted.length ? all.filter((c) => wanted.includes(c.name)) : all;

if (selected.length === 0) {
    console.error(
        `✗ no contract named ${wanted.join(", ")}. Known: ${all.map((c) => c.name).join(", ")}`,
    );
    process.exit(1);
}

const missing = selected.filter((c) => !fs.existsSync(c.bundle));
if (missing.length) {
    console.error(
        `✗ missing bundle(s): ${missing.map((c) => path.relative(ROOT, c.bundle)).join(", ")}\n` +
            "  Run `npm run bundle` first.",
    );
    process.exit(1);
}

const children = [];
let shuttingDown = false;

/**
 * Stop every child on the way out.
 *
 * Without this, Ctrl-C kills this process and leaves the prism children holding their ports, so the
 * next `npm run mock` fails with EADDRINUSE against a server nobody can see. `detached: false` plus
 * an explicit signal is what makes one Ctrl-C mean what the user meant by it.
 */
function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) child.kill("SIGTERM");
    process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const contract of selected) {
    const child = spawn(PRISM, ["mock", contract.bundle, "--port", String(contract.port)], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
    });

    // Prefix every line so three interleaved servers stay readable.
    const tag = `[${contract.name}]`;
    for (const stream of [child.stdout, child.stderr]) {
        stream.setEncoding("utf8");
        let buffered = "";
        stream.on("data", (chunk) => {
            buffered += chunk;
            const lines = buffered.split("\n");
            buffered = lines.pop() ?? "";
            for (const line of lines) if (line.trim()) console.log(`${tag} ${line}`);
        });
    }

    child.on("exit", (code) => {
        if (shuttingDown) return;
        console.error(`✗ ${contract.name} mock exited (${code}). Stopping the rest.`);
        shutdown(code ?? 1);
    });

    children.push(child);
}

console.log("");
for (const c of selected) console.log(`  ${c.name.padEnd(14)} http://localhost:${c.port}`);
console.log("\n  Any non-empty bearer token is accepted. Ctrl-C to stop.\n");
