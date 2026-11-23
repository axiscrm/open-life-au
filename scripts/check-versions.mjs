#!/usr/bin/env node
/**
 * Every contract's version must agree in all four places it is written down.
 *
 * A contract's version lives in `domains/<name>/version.txt`, in `info.version` inside its
 * `openapi.yaml`, in `.release-please-manifest.json`, and implicitly in whether
 * `release-please-config.json` knows about the package at all. release-please keeps them in step
 * when it runs — but it is currently parked to manual dispatch, and a contract added by hand (every
 * one so far) has to get all four right unaided.
 *
 * Nothing caught that before this script. The failure is quiet in the way that matters: a contract
 * missing from `release-please-config.json` still lints, still bundles, still generates clients, and
 * simply never gets released, which nobody notices until someone asks why the tag is missing. A
 * `version.txt` out of step with `info.version` is worse — the published document and the release
 * tag disagree about what an implementer is looking at.
 *
 * The contract list comes from `redocly.yaml`, the same single source the rest of the tooling uses,
 * so a domain registered for linting cannot be forgotten here.
 *
 * NOT CHECKED, and deliberately: that a `core` change is accompanied by a release of each dependent
 * contract. That rule is real (see docs/VERSIONING.md) but it is about RELEASES rather than the
 * working tree, so it needs a base ref to compare against and only means anything once release-please
 * is unparked. Stated as a review responsibility there rather than claimed as an automated gate.
 *
 * THE ROOT README is checked too. Its contract table and every `<contract>-v<version>` tag it names
 * must carry the version in `.release-please-manifest.json`. release-please cannot keep it in step:
 * its generic updater rewrites every marked line with the releasing package's version, and the README
 * names four contracts. It drifted through six releases before this check existed. `--fix` rewrites
 * the README in place, so a release PR is fixed with one command.
 *
 * Usage: node scripts/check-versions.mjs [--fix]
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import { ROOT, contracts } from "./contracts.mjs";

const SEMVER = /^\d+\.\d+\.\d+$/;
const FIX = process.argv.includes("--fix");
const problems = [];

const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, ".release-please-manifest.json"), "utf8"),
);
const releaseConfig = JSON.parse(
    fs.readFileSync(path.join(ROOT, "release-please-config.json"), "utf8"),
);

// `core` is versioned too, and is the one every contract depends on.
const coreVersionFile = path.join(ROOT, "core", "version.txt");
if (!fs.existsSync(coreVersionFile)) {
    problems.push("core/version.txt is missing");
} else {
    const coreVersion = fs.readFileSync(coreVersionFile, "utf8").trim();
    if (!SEMVER.test(coreVersion)) {
        problems.push(`core/version.txt is not a semver: "${coreVersion}"`);
    }
    if (manifest.core !== coreVersion) {
        problems.push(
            `core: version.txt is ${coreVersion} but .release-please-manifest.json says ${manifest.core}`,
        );
    }
    if (!releaseConfig.packages?.core) {
        problems.push("core has no entry in release-please-config.json, so it will never be released");
    }
}

for (const contract of contracts()) {
    const { name } = contract;
    const pkgPath = `domains/${name}`;

    const versionFile = path.join(ROOT, pkgPath, "version.txt");
    const declared = fs.existsSync(versionFile)
        ? fs.readFileSync(versionFile, "utf8").trim()
        : null;
    if (declared === null) {
        problems.push(`${name}: ${pkgPath}/version.txt is missing`);
    } else if (!SEMVER.test(declared)) {
        problems.push(`${name}: version.txt is not a semver: "${declared}"`);
    }

    const info = YAML.parse(fs.readFileSync(contract.source, "utf8")).info ?? {};
    if (declared !== null && info.version !== declared) {
        problems.push(
            `${name}: openapi.yaml info.version is ${info.version} but version.txt is ${declared}`,
        );
    }

    if (!(pkgPath in manifest)) {
        problems.push(`${name}: no "${pkgPath}" entry in .release-please-manifest.json`);
    } else if (declared !== null && manifest[pkgPath] !== declared) {
        problems.push(
            `${name}: version.txt is ${declared} but .release-please-manifest.json says ${manifest[pkgPath]}`,
        );
    }

    const pkg = releaseConfig.packages?.[pkgPath];
    if (!pkg) {
        problems.push(
            `${name}: no "${pkgPath}" package in release-please-config.json, so it will never be released`,
        );
    } else {
        // `extra-files` is what rewrites `info.version` on release. Without it the published
        // document keeps the previous version forever while the git tag moves — and the
        // `# x-release-please-version` marker in the file promises otherwise.
        const extra = pkg["extra-files"] ?? [];
        if (!extra.includes("openapi.yaml")) {
            problems.push(
                `${name}: release-please-config.json does not list openapi.yaml in extra-files, ` +
                    "so info.version will not be updated on release",
            );
        }
        // The committed bundle must move in the same commit, or CI's dist/ drift check fails the
        // release PR. The YAML bundle relies on the marker scripts/mark-dist-version.mjs adds.
        const distYaml = `/dist/${name}/openapi.yaml`;
        const distJson = `/dist/${name}/openapi.json`;
        if (!extra.includes(distYaml)) {
            problems.push(`${name}: release-please-config.json extra-files is missing "${distYaml}"`);
        }
        if (!extra.some((f) => f?.type === "json" && f.path === distJson && f.jsonpath === "$.info.version")) {
            problems.push(
                `${name}: release-please-config.json extra-files is missing ` +
                    `{ "type": "json", "path": "${distJson}", "jsonpath": "$.info.version" }`,
            );
        }
        if (!pkg.component) {
            problems.push(`${name}: release-please package has no component, so the tag prefix is undefined`);
        }
    }
}

// The root README: one table row per contract, and any `<contract>-v<version>` tag it names.
const readmePath = path.join(ROOT, "README.md");
let readme = fs.readFileSync(readmePath, "utf8");
const readmeFixes = [];
for (const { name } of contracts()) {
    const expected = manifest[`domains/${name}`];
    if (!expected) continue; // already reported above

    const row = new RegExp(`^(\\| \\[\\*\\*${name}\\*\\*\\]\\(domains/${name}/\\) \\| \`v)(\\d+\\.\\d+\\.\\d+)(\`)`, "m");
    const match = readme.match(row);
    if (!match) {
        problems.push(`README.md: no row for ${name} in the contract table, or its version is not in \`vX.Y.Z\` form`);
    } else if (match[2] !== expected) {
        readmeFixes.push(`${name}: table says v${match[2]}, released version is ${expected}`);
        readme = readme.replace(row, `$1${expected}$3`);
    }

    const tag = new RegExp(`\\b${name}-v(\\d+\\.\\d+\\.\\d+)\\b`, "g");
    for (const [, version] of readme.matchAll(tag)) {
        if (version !== expected) {
            readmeFixes.push(`${name}: README names tag ${name}-v${version}, released version is ${expected}`);
        }
    }
    readme = readme.replace(tag, `${name}-v${expected}`);
}
if (readmeFixes.length) {
    if (FIX) {
        fs.writeFileSync(readmePath, readme);
        console.log(`✓ README.md rewritten to the released versions:\n${readmeFixes.map((f) => `  ${f}`).join("\n")}`);
    } else {
        problems.push(...readmeFixes.map((f) => `README.md ${f}. Run \`npm run versions:fix\``));
    }
}

if (problems.length) {
    console.error("✗ version metadata is inconsistent:\n");
    for (const p of problems) console.error(`  ${p}`);
    console.error("");
    process.exit(1);
}

const names = contracts().map((c) => c.name);
console.log(`✓ versions consistent — core + ${names.length} contracts (${names.join(", ")})`);
