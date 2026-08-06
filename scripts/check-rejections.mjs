#!/usr/bin/env node
/**
 * Prove the contract REJECTS what it claims to reject.
 *
 * The worked examples show that valid payloads validate. That is the easy half, and on its own it
 * is close to worthless: a schema that accepts everything also passes it. The value of typing the
 * cover options — the main thing this standard does that a loose "options" object does not — lies
 * entirely in what it refuses, so each refusal is asserted here.
 *
 * Every case below is a mistake seen in practice, and every one of them is SILENT if it gets
 * through: an income-protection waiting period on a life cover, or a misspelled option key, is
 * simply ignored by a permissive implementation, and the resulting quote looks completely normal
 * while pricing something the adviser did not ask for.
 *
 * Usage: node scripts/check-rejections.mjs   (run `npm run bundle` first)
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUNDLE = path.join(ROOT, "dist/quoting/openapi.yaml");

if (!fs.existsSync(BUNDLE)) {
    console.error("✗ dist/quoting/openapi.yaml is missing. Run `npm run bundle` first.");
    process.exit(1);
}

const doc = YAML.parse(fs.readFileSync(BUNDLE, "utf8"));
const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(ajv);
ajv.addSchema({ ...doc, $id: "contract" }, "contract");
const validateRequest = ajv.getSchema("contract#/components/schemas/QuoteRequest");

const AUD = (amount) => ({ amount, currency: "AUD" });
const insured = {
    age_next_birthday: 41,
    gender: "male",
    smoker: false,
    state: "NSW",
    occupation: { osca: "3323-11" },
};
const life = (extra = {}) => ({
    cover_id: "life-1",
    cover_type: "life",
    sum_insured: AUD("1000000.00"),
    ...extra,
});

const CASES = [
    {
        name: "an income-protection option on a life cover",
        why: "the whole point of discriminating covers on cover_type",
        doc: { insured, covers: [life({ waiting_period: "90d" })] },
    },
    {
        name: "a misspelled option key (dobule_benefit)",
        why: "a typo must fail loudly, not be silently ignored",
        doc: {
            insured,
            covers: [
                {
                    cover_id: "tpd-1",
                    cover_type: "tpd",
                    sum_insured: AUD("500000.00"),
                    dobule_benefit: "include",
                },
            ],
        },
    },
    {
        name: "money sent as a JSON number",
        why: "amounts are decimal strings; a float drifts by cents",
        doc: { insured, covers: [life({ sum_insured: { amount: 1000000, currency: "AUD" } })] },
    },
    {
        name: "money with three decimal places",
        why: "premiums are compared to the cent",
        doc: { insured, covers: [life({ sum_insured: AUD("1000000.005") })] },
    },
    {
        name: "an unrecognised structure value",
        why: "request enums are closed, so a wrong value cannot price as a default",
        doc: { insured, policy: { structure: "level_60" }, covers: [life()] },
    },
    {
        name: "linked_to without link_type",
        why: "a rider must state how it relates to its parent",
        doc: {
            insured,
            covers: [
                life(),
                {
                    cover_id: "tpd-1",
                    cover_type: "tpd",
                    sum_insured: AUD("500000.00"),
                    linked_to: "life-1",
                },
            ],
        },
    },
    {
        name: "a loading keyed on needle_stick",
        why: "only the five loadable benefits have a loading axis",
        doc: {
            insured,
            policy: { loadings: { percentage: { needle_stick: 25 } } },
            covers: [life()],
        },
    },
    {
        name: "a client name smuggled into the insured",
        why: "Insured is closed precisely so personal details have nowhere to go",
        doc: { insured: { ...insured, first_name: "Jane" }, covers: [life()] },
    },
    {
        name: "a cover-level sum_insured on child trauma",
        why: "child trauma is priced per child, so a cover-level amount is ambiguous",
        doc: {
            insured,
            covers: [
                {
                    cover_id: "child-1",
                    cover_type: "child_trauma",
                    sum_insured: AUD("50000.00"),
                    children: [
                        { age_next_birthday: 9, gender: "male", sum_insured: AUD("50000.00") },
                    ],
                },
            ],
        },
    },
    {
        name: "an occupation with no identifying reference",
        why: "qualifiers alone cannot identify an occupation",
        doc: {
            insured: { ...insured, occupation: { qualifiers: { trade_qualified: true } } },
            covers: [life()],
        },
    },
    {
        name: "both age_next_birthday and date_of_birth",
        why: "two sources of age is a data-minimisation failure and an ambiguity",
        doc: {
            insured: { ...insured, date_of_birth: "1985-03-14" },
            covers: [life()],
        },
    },
    {
        name: "a request with no covers",
        why: "there is nothing to price",
        doc: { insured, covers: [] },
    },
    {
        name: "a negative sum insured",
        why: "rejected at the boundary rather than surfacing as a nonsensical premium",
        doc: { insured, covers: [life({ sum_insured: AUD("-1000.00") })] },
    },
    {
        name: "a currency other than AUD",
        why: "this version of the standard is Australia-only, and says so",
        doc: {
            insured,
            covers: [life({ sum_insured: { amount: "1000000.00", currency: "NZD" } })],
        },
    },
];

let wronglyAccepted = 0;

for (const { name, why, doc: candidate } of CASES) {
    if (validateRequest(candidate)) {
        wronglyAccepted += 1;
        console.error(`✗ ACCEPTED — should have been rejected: ${name}`);
        console.error(`    ${why}`);
    } else {
        console.log(`✓ rejected: ${name}`);
    }
}

console.log(
    `\n${CASES.length - wronglyAccepted}/${CASES.length} invalid payloads correctly rejected`,
);
process.exit(wronglyAccepted === 0 ? 0 : 1);
