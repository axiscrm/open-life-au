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
const SUITES = [
    { bundle: "dist/quoting/openapi.yaml", dir: "domains/quoting/examples/requests", schema: "QuoteRequest" },
    { bundle: "dist/quoting/openapi.yaml", dir: "domains/quoting/examples/responses", schema: "QuoteResponse" },
    { bundle: "dist/policy/openapi.yaml", dir: "domains/policy/examples/responses", schema: "PolicyPage" },
    { bundle: "dist/policy/openapi.yaml", dir: "domains/policy/examples/arrears", schema: "ArrearsPage" },
    {
        bundle: "dist/requirements/openapi.yaml",
        dir: "domains/requirements/examples/responses",
        schema: "RequirementsPage",
    },
];

/** Ajv instance per bundled contract, built on first use. */
const validators = new Map();
function schemaFor(bundle, name) {
    if (!validators.has(bundle)) {
        const abs = path.join(ROOT, bundle);
        if (!fs.existsSync(abs)) {
            console.error(`✗ ${bundle} is missing. Run \`npm run bundle\` first.`);
            process.exit(1);
        }
        const ajvInstance = buildAjv(YAML.parse(fs.readFileSync(abs, "utf8")), bundle);
        validators.set(bundle, ajvInstance);
    }
    return validators.get(bundle).getSchema(`${bundle}#/components/schemas/${name}`);
}

// `strict: false` because we are handing Ajv a whole OpenAPI document, which carries keywords
// (`openapi`, `discriminator`, `example`, …) that are not JSON Schema. The schemas themselves are
// plain 2020-12. `discriminator` is intentionally NOT enabled: each cover variant pins
// `cover_type` with a `const`, so a bare `oneOf` already selects exactly one branch, and Ajv's
// discriminator support does not handle a tag declared inside `allOf`.
function buildAjv(doc, id) {
    const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
    addFormats(ajv);
    ajv.addSchema({ ...doc, $id: id }, id);
    return ajv;
}

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
                if (b.policy_fee_premium && b.policy_fee_stamp_duty) {
                    const split = cents(b.policy_fee_premium) + cents(b.policy_fee_stamp_duty);
                    if (b.policy_fee && split !== cents(b.policy_fee)) {
                        problems.push(
                            `${setAt}.${freq}: policy_fee_premium + policy_fee_stamp_duty = ` +
                                `${split / 100} but policy_fee is ${cents(b.policy_fee) / 100}`,
                        );
                    }
                }
                if (parts !== cents(b.total)) {
                    problems.push(
                        `${setAt}.${freq}: components sum to ${parts / 100} but total is ` +
                            `${cents(b.total) / 100}`,
                    );
                }
            }

            // Annualised cost must not increase as the payment period lengthens — allowing the
            // rounding tolerance the contract states. Each frequency is rounded to the cent, so at
            // zero frequency loading the products legitimately cross by up to one cent per period:
            // a $1,000 annual premium gives monthly 83.33 (999.96 annualised) against quarterly
            // 250.00 (1,000.00). Without the tolerance this check fails every honest insurer that
            // levies no frequency loading.
            const annualised = FREQUENCY_ORDER.map((f) =>
                set[f] ? cents(set[f].total) * PERIODS_PER_YEAR[f] : null,
            );
            for (let k = 0; k < annualised.length - 1; k += 1) {
                if (annualised[k] === null || annualised[k + 1] === null) continue;
                const tolerance = PERIODS_PER_YEAR[FREQUENCY_ORDER[k]];
                if (annualised[k] + tolerance < annualised[k + 1]) {
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

/**
 * A priced line must account for every cover the paired request asked for.
 *
 * This is the check that was missing, and its absence let the flagship response example claim
 * `all_needs_met: true` while pricing one of the two requested covers — the exact silent failure rule
 * 2 exists to prevent, in the document implementers copy. The schema cannot catch it: it needs the
 * request and the response together, so it lives here.
 *
 * Pairs a response to a request by `client_reference`.
 */
function checkCoversAccountedFor(response, where) {
    const requestDir = path.join(ROOT, "domains/quoting/examples/requests");
    if (!fs.existsSync(requestDir)) return true;

    const paired = fs
        .readdirSync(requestDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(requestDir, f), "utf8")))
        .find((r) => r.client_reference && r.client_reference === response.client_reference);
    if (!paired) return true;

    const requested = new Set((paired.covers ?? []).map((c) => c.cover_id));
    const problems = [];
    for (const [i, line] of (response.lines ?? []).entries()) {
        if (line.all_needs_met === false) continue;
        const priced = new Set((line.cover_lines ?? []).map((c) => c.cover_id).filter(Boolean));
        const missing = [...requested].filter((id) => !priced.has(id));
        if (missing.length) {
            problems.push(
                `lines[${i}] (${line.line_id}): all_needs_met is true but these requested covers ` +
                    `have no cover_line: ${missing.join(", ")}`,
            );
        }
    }
    if (problems.length) {
        console.error(`✗ ${where}  →  covers accounted for`);
        for (const p of problems) console.error(`    ${p}`);
    }
    return problems.length === 0;
}

let checked = 0;
let failed = 0;

for (const { bundle, dir, schema } of SUITES) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;

    const validate = schemaFor(bundle, schema);
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
            if (schema === "QuoteResponse") {
                const ok = checkInvariants(data, rel) && checkCoversAccountedFor(data, rel);
                if (!ok) {
                    failed += 1;
                    continue;
                }
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
