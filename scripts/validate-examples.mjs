#!/usr/bin/env node
/**
 * Validate every worked example against the bundled contract.
 *
 * This is the repo's most important test, and not because examples matter in themselves. It is
 * the EXPRESSIVENESS check: each example under `examples/requests/` is a real scenario taken off a
 * live quoting screen, and if one of them cannot be expressed here, the contract has lost
 * something an adviser actually asks for. A schema that validates but cannot describe a linked TPD
 * inside superannuation is worse than no schema, because the gap only surfaces during an
 * insurer's implementation.
 *
 * Requests validate against QuoteRequest, responses against QuoteResponse, by directory. Response
 * examples are additionally checked against the arithmetic invariants the contract states in
 * prose but JSON Schema cannot express — the premium split summing exactly to the total, and the
 * frequency-loading ordering. Those are the rules an implementer is most likely to get wrong, so a
 * worked example that violated one would teach the wrong thing.
 *
 * Examples are validated EXACTLY as committed — nothing is stripped first. That is deliberate, and
 * it was learned the hard way: an earlier version carried `$comment` annotations for the reader and
 * stripped them here, which meant the files passed this check while being rejected by the mock
 * server with a 422, because the request schemas are closed. Anyone who copy-pasted an example — the
 * first thing a person evaluating a contract does — would have hit that.
 *
 * So the narrative lives in examples/README.md and these files stay postable. If you are tempted to
 * annotate a payload inline, that is the file to put it in.
 *
 * Usage: node scripts/validate-examples.mjs   (run `npm run bundle` first)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUNDLE = path.join(ROOT, "dist/quoting/openapi.yaml");

const SUITES = [
    { dir: "domains/quoting/examples/requests", schema: "QuoteRequest" },
    { dir: "domains/quoting/examples/responses", schema: "QuoteResponse" },
];

if (!fs.existsSync(BUNDLE)) {
    console.error(`✗ ${path.relative(ROOT, BUNDLE)} is missing. Run \`npm run bundle\` first.`);
    process.exit(1);
}

const doc = YAML.parse(fs.readFileSync(BUNDLE, "utf8"));

// `strict: false` because we are handing Ajv a whole OpenAPI document, which carries keywords
// (`openapi`, `discriminator`, `example`, …) that are not JSON Schema. The schemas themselves are
// plain 2020-12. `discriminator` is intentionally NOT enabled: each cover variant pins
// `cover_type` with a `const`, so a bare `oneOf` already selects exactly one branch, and Ajv's
// discriminator support does not handle a tag declared inside `allOf`.
const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema({ ...doc, $id: "contract" }, "contract");

const PERIODS_PER_YEAR = {
    weekly: 52,
    fortnightly: 26,
    monthly: 12,
    quarterly: 4,
    half_yearly: 2,
    annual: 1,
};
/** Descending annualised order: a shorter period costs more once the frequency loading applies. */
const FREQUENCY_ORDER = ["weekly", "fortnightly", "monthly", "quarterly", "half_yearly", "annual"];

const cents = (money) => Math.round(Number(money.amount) * 100);

/**
 * The rules the contract states normatively in prose. Each is a SILENT failure mode: it produces a
 * plausible number rather than an error, so nothing downstream looks wrong.
 */
function checkInvariants(response, where) {
    const problems = [];

    for (const [i, line] of (response.lines ?? []).entries()) {
        const at = `lines[${i}] (${line.line_id})`;

        // A line that could not be assembled is not an offer, and must not carry a price.
        if (line.all_needs_met === false) {
            if (line.premiums) problems.push(`${at}: all_needs_met is false but premiums present`);
            if (!line.errors?.length) problems.push(`${at}: all_needs_met is false but errors is empty`);
            continue;
        }
        if (!line.premiums) {
            problems.push(`${at}: all_needs_met is true but no premiums`);
            continue;
        }
        if (line.errors?.length) problems.push(`${at}: all_needs_met is true but errors is non-empty`);

        const sets = [
            [line.premiums, at],
            ...(line.cover_lines ?? []).map((c, j) => [c.premiums, `${at}.cover_lines[${j}]`]),
        ];

        for (const [set, setAt] of sets) {
            if (!set) continue;

            // total == premium_super + stamp_duty_super + premium_non_super + stamp_duty_non_super
            for (const freq of FREQUENCY_ORDER) {
                const b = set[freq];
                if (!b) {
                    problems.push(`${setAt}.${freq}: missing — all six frequencies are required`);
                    continue;
                }
                const parts =
                    cents(b.premium_super) +
                    cents(b.stamp_duty_super) +
                    cents(b.premium_non_super) +
                    cents(b.stamp_duty_non_super);
                if (parts !== cents(b.total)) {
                    problems.push(
                        `${setAt}.${freq}: components sum to ${parts / 100} but total is ` +
                            `${cents(b.total) / 100}`,
                    );
                }
            }

            // Annualised cost must not increase as the payment period lengthens.
            const annualised = FREQUENCY_ORDER.map((f) =>
                set[f] ? cents(set[f].total) * PERIODS_PER_YEAR[f] : null,
            );
            for (let k = 0; k < annualised.length - 1; k += 1) {
                if (annualised[k] === null || annualised[k + 1] === null) continue;
                if (annualised[k] < annualised[k + 1]) {
                    problems.push(
                        `${setAt}: ${FREQUENCY_ORDER[k]} annualises to ${annualised[k] / 100}, ` +
                            `below ${FREQUENCY_ORDER[k + 1]} at ${annualised[k + 1] / 100} — a ` +
                            "frequency loading can only make shorter periods dearer",
                    );
                }
            }
        }
    }

    if (problems.length) {
        console.error(`✗ ${where}  →  invariants`);
        for (const p of problems) console.error(`    ${p}`);
    }
    return problems.length === 0;
}

let checked = 0;
let failed = 0;

for (const { dir, schema } of SUITES) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;

    const validate = ajv.getSchema(`contract#/components/schemas/${schema}`);
    if (!validate) {
        console.error(`✗ schema ${schema} not found in the bundle`);
        failed += 1;
        continue;
    }

    for (const file of fs.readdirSync(abs).filter((f) => f.endsWith(".json")).sort()) {
        const rel = path.join(dir, file);
        const data = JSON.parse(fs.readFileSync(path.join(abs, file), "utf8"));
        checked += 1;

        if (validate(data)) {
            if (schema === "QuoteResponse" && !checkInvariants(data, rel)) {
                failed += 1;
                continue;
            }
            console.log(`✓ ${rel}  →  ${schema}`);
            continue;
        }

        failed += 1;
        console.error(`✗ ${rel}  →  ${schema}`);
        // `oneOf` failures produce one error per non-matching branch, which for a seven-way cover
        // union is a wall of noise. Report the errors that name a concrete location first.
        const errors = [...validate.errors].sort(
            (a, b) => b.instancePath.length - a.instancePath.length,
        );
        for (const err of errors.slice(0, 12)) {
            const where = err.instancePath || "(root)";
            const extra = err.params?.additionalProperty
                ? ` (${err.params.additionalProperty})`
                : err.params?.allowedValues
                  ? ` (allowed: ${err.params.allowedValues.join(", ")})`
                  : "";
            console.error(`    ${where} ${err.message}${extra}`);
        }
        if (errors.length > 12) console.error(`    … and ${errors.length - 12} more`);
    }
}

console.log(`\n${checked - failed}/${checked} examples valid`);
process.exit(failed === 0 ? 0 : 1);
