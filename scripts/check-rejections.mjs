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
const validateLine = ajv.getSchema("contract#/components/schemas/QuoteLine");

// The policy contract gets its own Ajv instance — a separate bundle, so a separate document.
const POLICY_BUNDLE = path.join(ROOT, "dist/policy/openapi.yaml");
if (!fs.existsSync(POLICY_BUNDLE)) {
    console.error("✗ dist/policy/openapi.yaml is missing. Run `npm run bundle` first.");
    process.exit(1);
}
const policyDoc = YAML.parse(fs.readFileSync(POLICY_BUNDLE, "utf8"));
const policyAjv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(policyAjv);
policyAjv.addSchema({ ...policyDoc, $id: "policy" }, "policy");
const validatePage = policyAjv.getSchema("policy#/components/schemas/PolicyPage");
const validatePolicy = policyAjv.getSchema("policy#/components/schemas/Policy");

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
        name: "a percentage loading sent as a JSON number",
        why: "percentages are decimal strings for the same reason amounts are",
        doc: { insured, policy: { loadings: { percentage: { life: 25 } } }, covers: [life()] },
    },
    {
        name: "a percentage loading above 1000",
        why: "a four-digit loading is a units mistake, not a 2000% premium",
        doc: { insured, policy: { loadings: { percentage: { life: "1001" } } }, covers: [life()] },
    },
    {
        name: "required_features keyed on something that is not a cover type",
        why: "a feature code is scoped to a benefit; an unscoped one filters nothing",
        doc: { insured, covers: [life()], required_features: { lifecover: ["X"] } },
    },
    {
        name: "an empty required_features list for a benefit",
        why: "an empty filter is indistinguishable from no filter and is more likely a bug",
        doc: { insured, covers: [life()], required_features: { life: [] } },
    },
    {
        name: "a projection asking for both years and to_age",
        why: "two horizons is ambiguous, and the insurer guessing is the failure",
        doc: { insured, covers: [life()], projection: { years: 10, to_age: 65 } },
    },
    {
        name: "a projection with neither years nor to_age",
        why: "a horizon with no end is not a request",
        doc: { insured, covers: [life()], projection: { indexation: { rate: "5" } } },
    },
    {
        name: "a loading keyed on needle_stick",
        why: "only the five loadable benefits have a loading axis",
        doc: {
            insured,
            policy: { loadings: { percentage: { needle_stick: "25" } } },
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

// ---------------------------------------------------------------------------------------------
// Response-side and policy-domain cases.
//
// Everything above is a quoting REQUEST. That was the whole suite, which meant the rules that guard
// against a bad RESPONSE — the ones whose failure modes are silent — had nothing asserting them, and
// the policy contract had no negative coverage at all.
// ---------------------------------------------------------------------------------------------

const money = (a) => ({ amount: a, currency: "AUD" });
const breakdown = {
    total: money("1.00"),
    premium_super: money("1.00"),
    premium_non_super: money("0"),
    stamp_duty_super: money("0"),
    stamp_duty_non_super: money("0"),
};
const premiums = Object.fromEntries(
    ["weekly", "fortnightly", "monthly", "quarterly", "half_yearly", "annual"].map((f) => [f, breakdown]),
);
const lineBase = {
    line_id: "ln_1",
    insurer_id: "example-life",
    brand_id: "example-life",
    product_name: "Protection",
    resolved_occupation: { insurer_occupation_id: "OCC-1", description: "Painter", ratings: {} },
};

const LINE_CASES = [
    {
        name: "a declined line carrying a premium",
        why: "rule 2 — a partial policy priced as though complete sorts cheapest-first",
        doc: { ...lineBase, all_needs_met: false, errors: ["cannot assemble"], premiums },
    },
    {
        name: "a declined line with an empty errors array",
        why: "an unexplained decline gives the adviser nothing to act on",
        doc: { ...lineBase, all_needs_met: false, errors: [] },
    },
    {
        name: "a priced line with no premiums",
        why: "rule 2's other half — `all_needs_met: true` promises a price",
        doc: { ...lineBase, all_needs_met: true },
    },
    {
        name: "a declined line carrying a projection",
        why: "projecting a price that does not exist puts a total into a comparison",
        doc: {
            ...lineBase,
            all_needs_met: false,
            errors: ["cannot assemble"],
            projection: {
                basis: { years: 1, indexed: false },
                total: AUD("100.00"),
                years: [{ year: 0, annual_total: AUD("100.00"), cumulative_total: AUD("100.00") }],
            },
        },
    },
    {
        name: "research scores with no provider",
        why: "an unattributed score is an insurer marking its own homework",
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            research_scores: { feature_score: "87.5" },
        },
    },
    {
        name: "a research score above 100",
        why: "the scale is 0-100; anything else is a different provider's scale",
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            research_scores: { provider: "Example Research", feature_score: "101" },
        },
    },
    {
        name: "a document with no url",
        why: "a document nobody can fetch is not a document",
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            documents: [{ document_type: "pds" }],
        },
    },
    {
        name: "a document of an unrecognised type",
        why: "an untyped link cannot be rendered or trust-scoped by a consumer",
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            documents: [{ document_type: "brochure", url: "https://example.com/x.pdf" }],
        },
    },
    {
        name: "a priced line with no rate_table_version",
        why: "rule 4 — without it the quote is unreproducible at audit",
        doc: { ...lineBase, all_needs_met: true, premiums },
    },
];

const policyBase = {
    policy_id: "P-1",
    insurer_id: "example-life",
    status: "in_force",
    policy_holder: { last_name: "Alvarez" },
    covers: [{ benefit_name: "Life Cover", sum_insured: money("1000000.00") }],
};
const pageBase = {
    mode: "full",
    snapshot_id: "snap_1",
    generated_at: "2026-08-06T02:31:44+10:00",
    total_count: 1,
    complete: true,
    coverage: { adviser_codes: ["AC100"], statuses: ["in_force"] },
    policies: [policyBase],
};

const POLICY_PAGE_CASES = [
    {
        name: "a snapshot page with no total_count",
        why: "the count gate is what detects a walk that silently lost a page",
        doc: (() => { const d = { ...pageBase }; delete d.total_count; return d; })(),
    },
    {
        name: "a snapshot page with no complete flag",
        why: "absence-based reconciliation gates on it; optional meant a consumer could deadlock",
        doc: (() => { const d = { ...pageBase }; delete d.complete; return d; })(),
    },
    {
        name: "a snapshot page with no coverage",
        why: "absence is scoped to coverage — without it a dropped adviser code lapses a book",
        doc: (() => { const d = { ...pageBase }; delete d.coverage; return d; })(),
    },
    {
        name: "a snapshot page with no mode",
        why: "a delta would otherwise be byte-identical to a full snapshot",
        doc: (() => { const d = { ...pageBase }; delete d.mode; return d; })(),
    },
    {
        name: "an advisory total_count inside page",
        why: "two count fields with opposite guarantees is how a safety check gets built on an estimate",
        doc: { ...pageBase, page: { total_count: 999 } },
    },
];

const OCCUPATION_CASES = [
    {
        name: "a supported rating with no rating class",
        why: "echoing 'what you rated' without the class that drove the premium is not auditable",
        doc: { supported: true },
    },
];

const RESOLVED_OPTION_CASES = [
    {
        name: "a substitution that does not say what was priced",
        why: "the consumer learns the request was not honoured but still has an unexplained premium",
        doc: { cover_id: "life-1", option: "structure", requested: "level_65", resolution: "substituted" },
    },
];

const COVER_LINE_CASES = [
    {
        name: "an income-protection cover line reporting a sum insured",
        why: "IP is written as a monthly benefit; the two units differ by 12x and look alike",
        doc: { cover_type: "income_protection", sum_insured: money("6500.00"), premiums },
    },
    {
        name: "a cover line carrying both a sum insured and a monthly benefit",
        why: "ambiguous which one was written",
        doc: {
            cover_type: "income_protection",
            monthly_benefit: money("6500.00"),
            sum_insured: money("78000.00"),
            premiums,
        },
    },
    {
        name: "a life cover line reporting a monthly benefit",
        why: "lump-sum covers are not written as a monthly amount",
        doc: { cover_type: "life", monthly_benefit: money("1000.00"), premiums },
    },
];

const POLICY_CASES = [
    {
        name: "arrears on an in_force policy",
        why: "an ?status=in_arrears worklist would silently return nothing",
        doc: { ...policyBase, arrears: { dishonoured_on: "2026-07-15", amount_outstanding: money("10.00") } },
    },
    {
        name: "arrears with nothing outstanding",
        why: "the block means behind on premium; nil outstanding is a contradiction",
        doc: { ...policyBase, status: "in_arrears", arrears: { dishonoured_on: "2026-07-15", amount_outstanding: money("0") } },
    },
    {
        name: "a commission split above 100 percent",
        why: "it shared the generic Percentage schema, which allows up to 1000",
        doc: { ...policyBase, distribution: { new_business_split_percent: 900 } },
    },
    {
        name: "an empty arrears array",
        why: "absence means paid up; an empty array is an ambiguous third state",
        doc: { ...policyBase, status: "in_arrears", arrears: [] },
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

const validateRating = ajv.getSchema("contract#/components/schemas/CoverRating");
const validateResolvedOption = ajv.getSchema("contract#/components/schemas/ResolvedOption");
const validateCoverLine = ajv.getSchema("contract#/components/schemas/CoverLine");

for (const [group, validator, cases] of [
    ["quoting response", validateLine, LINE_CASES],
    ["occupation rating", validateRating, OCCUPATION_CASES],
    ["resolved option", validateResolvedOption, RESOLVED_OPTION_CASES],
    ["cover line", validateCoverLine, COVER_LINE_CASES],
    ["policy page", validatePage, POLICY_PAGE_CASES],
    ["policy record", validatePolicy, POLICY_CASES],
]) {
    for (const { name, why, doc: candidate } of cases) {
        if (validator(candidate)) {
            wronglyAccepted += 1;
            console.error(`✗ ACCEPTED — should have been rejected: ${group} — ${name}`);
            console.error(`    ${why}`);
        } else {
            console.log(`✓ rejected: ${group} — ${name}`);
        }
    }
}

const total =
    CASES.length +
    LINE_CASES.length +
    OCCUPATION_CASES.length +
    RESOLVED_OPTION_CASES.length +
    COVER_LINE_CASES.length +
    POLICY_PAGE_CASES.length +
    POLICY_CASES.length;
console.log(`\n${total - wronglyAccepted}/${total} invalid payloads correctly rejected`);
process.exit(wronglyAccepted === 0 ? 0 : 1);
