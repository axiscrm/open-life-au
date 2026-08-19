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
const validateArrearsPage = policyAjv.getSchema("policy#/components/schemas/ArrearsPage");

// The requirements contract, likewise its own bundle and its own document.
const REQ_BUNDLE = path.join(ROOT, "dist/requirements/openapi.yaml");
if (!fs.existsSync(REQ_BUNDLE)) {
    console.error("✗ dist/requirements/openapi.yaml is missing. Run `npm run bundle` first.");
    process.exit(1);
}
const reqDoc = YAML.parse(fs.readFileSync(REQ_BUNDLE, "utf8"));
const reqAjv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(reqAjv);
reqAjv.addSchema({ ...reqDoc, $id: "requirements" }, "requirements");
const validateReqPage = reqAjv.getSchema("requirements#/components/schemas/RequirementsPage");
const validateRequirement = reqAjv.getSchema("requirements#/components/schemas/Requirement");

// The commissions contract, likewise its own bundle and its own document.
const COMM_BUNDLE = path.join(ROOT, "dist/commissions/openapi.yaml");
if (!fs.existsSync(COMM_BUNDLE)) {
    console.error("✗ dist/commissions/openapi.yaml is missing. Run `npm run bundle` first.");
    process.exit(1);
}
const commDoc = YAML.parse(fs.readFileSync(COMM_BUNDLE, "utf8"));
const commAjv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true });
addFormats(commAjv);
commAjv.addSchema({ ...commDoc, $id: "commissions" }, "commissions");
const validateCommLine = commAjv.getSchema("commissions#/components/schemas/CommissionLine");
const validateStatement = commAjv.getSchema("commissions#/components/schemas/CommissionStatement");

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
        name: "an unrecognised commission basis",
        why: "request enums are closed; a basis priced as a default is a premium on the wrong question",
        doc: { insured, policy: { commission: { basis: "upfront_60" } }, covers: [life()] },
    },
    {
        name: "a dial-down above 100 percent",
        why: "more than all of a commission cannot be given up — the generic Percentage allows 1000",
        doc: { insured, policy: { commission: { dial_down_percent: "120" } }, covers: [life()] },
    },
    {
        name: "a dial-down sent as a JSON number",
        why: "same reason as every other percentage here — a float drifts",
        doc: { insured, policy: { commission: { dial_down_percent: 30 } }, covers: [life()] },
    },
    {
        name: "a commission block with a misspelled key (dial_down)",
        why: "a dial-down silently not applied prices the dearest line and looks ordinary",
        doc: { insured, policy: { commission: { basis: "level", dial_down: "30" } }, covers: [life()] },
    },
    {
        name: "a commission block on a cover",
        why: "there is no per-cover basis: no engine applies remuneration per benefit, and the one that "
            + "could be forced to reported the policy basis anyway — so it must fail, not be ignored",
        doc: { insured, covers: [life({ commission: { basis: "level" } })] },
    },
    {
        name: "an insurer_commission_id sent as a number",
        why: "it is an opaque insurer identifier; a numeric one loses leading zeros silently",
        doc: { insured, policy: { commission: { insurer_commission_id: 66022 } }, covers: [life()] },
    },
    {
        name: "an empty insurer_commission_id",
        why: "an empty id is not a request for the default — it is a request the insurer must refuse",
        doc: { insured, policy: { commission: { insurer_commission_id: "" } }, covers: [life()] },
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
        name: "income protection with no annual_income on the insured",
        why: "a benefit expressed as a share of earnings cannot be checked without them",
        doc: {
            insured,
            covers: [
                {
                    cover_id: "ip-1",
                    cover_type: "income_protection",
                    monthly_benefit: AUD("8000.00"),
                },
            ],
        },
    },
    {
        name: "business expenses with no annual_income on the insured",
        why: "same rule — the cap is a proportion of income, so the income is mandatory",
        doc: {
            insured,
            covers: [
                {
                    cover_id: "be-1",
                    cover_type: "business_expenses",
                    monthly_benefit: AUD("10000.00"),
                },
            ],
        },
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
        doc: { ...lineBase, all_needs_met: true, commission: { basis: "upfront" } },
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
            commission: { basis: "upfront" },
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
            commission: { basis: "upfront" },
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
            commission: { basis: "upfront" },
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
            commission: { basis: "upfront" },
            documents: [{ document_type: "brochure", url: "https://example.com/x.pdf" }],
        },
    },
    {
        name: "a priced line with no rate_table_version",
        why: "rule 4 — without it the quote is unreproducible at audit",
        doc: { ...lineBase, all_needs_met: true, premiums, commission: { basis: "upfront" } },
    },
    {
        name: "a priced line with no commission basis",
        why: "rule 5 — an upfront-commission price and a level one sort into the same table",
        doc: { ...lineBase, all_needs_met: true, premiums, rate_table_version: "2026-01" },
    },
    {
        name: "a priced line whose commission basis is an unrecognised STRING, not an object",
        why: "the basis travels with its dial-down; a bare string cannot carry one",
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            commission: "upfront",
        },
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

const arrearsItemBase = {
    policy_id: "P-1",
    insurer_id: "example-life",
    arrears: [{ dishonoured_on: "2026-07-15", amount_outstanding: money("96.20") }],
};
const arrearsPageBase = {
    mode: "full",
    snapshot_id: "arr_1",
    generated_at: "2026-08-06T09:15:22+10:00",
    total_count: 1,
    complete: true,
    coverage: { adviser_codes: ["AC100"] },
    items: [arrearsItemBase],
};

// The arrears worklist repeats the policy snapshot's gate fields, so it repeats its failure modes.
// Asserted separately rather than assumed: the two pages are separate schemas, and "PolicyPage
// requires it" is not evidence that ArrearsPage does.
const ARREARS_PAGE_CASES = [
    {
        name: "a worklist page with no total_count",
        why: "same gate as the policy snapshot — it detects a walk that silently lost a page",
        doc: (() => { const d = { ...arrearsPageBase }; delete d.total_count; return d; })(),
    },
    {
        name: "a worklist page with no complete flag",
        why: "an incomplete walk read as complete closes dishonour tasks that are still outstanding",
        doc: (() => { const d = { ...arrearsPageBase }; delete d.complete; return d; })(),
    },
    {
        name: "a worklist page with no coverage",
        why: "an empty worklist for a silently dropped adviser code is indistinguishable from nobody being behind",
        doc: (() => { const d = { ...arrearsPageBase }; delete d.coverage; return d; })(),
    },
    {
        name: "a worklist page with no mode",
        why: "a delta applied as a full worklist clears every dishonour that did not happen to change",
        doc: (() => { const d = { ...arrearsPageBase }; delete d.mode; return d; })(),
    },
    {
        name: "a worklist row carrying covers",
        why: "the row is a projection, not a second source of truth for the book",
        doc: { ...arrearsPageBase, items: [{ ...arrearsItemBase, covers: [{ benefit_name: "Life Cover" }] }] },
    },
    {
        name: "a worklist row with an empty arrears array",
        why: "a row in the arrears worklist with no arrears is a contradiction, and there is no absent-means-paid-up reading here",
        doc: { ...arrearsPageBase, items: [{ ...arrearsItemBase, arrears: [] }] },
    },
];

const requirementBase = {
    requirement_id: "R1",
    requirement_type: "blood_profile",
    category: "medical",
    description: "Standard blood profile.",
    raised_on: "2026-07-09",
};
const caseBase = {
    case_id: "APP-1",
    insurer_id: "example-life",
    lives: [{ life_id: "L1", last_name: "Alvarez" }],
    requirements: [requirementBase],
};
const reqPageBase = {
    mode: "full",
    snapshot_id: "req_1",
    generated_at: "2026-08-06T05:02:11+10:00",
    total_count: 1,
    complete: true,
    coverage: { adviser_codes: ["AC100"] },
    cases: [caseBase],
};

const REQ_PAGE_CASES = [
    {
        name: "a page with no total_count",
        why: "the count gate is what detects a walk that silently lost a page",
        doc: (() => { const d = { ...reqPageBase }; delete d.total_count; return d; })(),
    },
    {
        name: "a page with no complete flag",
        why: "an incomplete walk read as complete closes a book's live requirements",
        doc: (() => { const d = { ...reqPageBase }; delete d.complete; return d; })(),
    },
    {
        name: "a page with no coverage",
        why: "a silently dropped adviser code produces an empty list, and absence then closes their work",
        doc: (() => { const d = { ...reqPageBase }; delete d.coverage; return d; })(),
    },
    {
        name: "a page with no mode",
        why: "a delta applied as a full snapshot closes every requirement that did not change",
        doc: (() => { const d = { ...reqPageBase }; delete d.mode; return d; })(),
    },
    {
        name: "a snapshot case with an empty requirements array",
        why: "a third state between outstanding and absent, which the absence rule cannot interpret",
        doc: { ...reqPageBase, cases: [{ ...caseBase, requirements: [] }] },
    },
    {
        name: "a snapshot case with no lives",
        why: "a requirement nobody can attribute to a person is not actionable",
        doc: { ...reqPageBase, cases: [{ ...caseBase, lives: [] }] },
    },
    {
        name: "a quoted case_id",
        why: "the spreadsheet-export apostrophe splits one application into two reconciliation keys",
        doc: { ...reqPageBase, cases: [{ ...caseBase, case_id: "'APP-1" }] },
    },
];

const REQUIREMENT_CASES = [
    {
        name: "a requirement with no description",
        why: "the mapped type is lossy; dropping the insurer's own wording loses what the adviser acts on",
        doc: (() => { const d = { ...requirementBase }; delete d.description; return d; })(),
    },
    {
        name: "a requirement with no raised_on",
        why: "without it every outstanding item ages identically and the worklist cannot be prioritised",
        doc: (() => { const d = { ...requirementBase }; delete d.raised_on; return d; })(),
    },
    {
        name: "a requirement with no requirement_id",
        why: "identity is what stops a worked task reopening on the next snapshot",
        doc: (() => { const d = { ...requirementBase }; delete d.requirement_id; return d; })(),
    },
    {
        name: "a requirement with an unrecognised category",
        why: "category decides which desk actions it, so it is closed rather than extensible",
        doc: { ...requirementBase, category: "financial" },
    },
    {
        name: "a requirement carrying an unknown field",
        why: "a misspelled key must surface rather than being silently absorbed",
        doc: { ...requirementBase, due_date: "2026-09-09" },
    },
];

const commLineBase = {
    line_id: "L1",
    policy_number: "P-4471902",
    commission_type: "new_business",
    amount: money("2104.00"),
    adviser_code: "AC100",
};
const statementBase = {
    statement_id: "STM-1",
    insurer_id: "example-life",
    payee: { payee_id: "PAY-1", name: "Rivera Advice Pty Ltd" },
    statement_date: "2026-08-06",
    currency: "AUD",
    line_count: 1,
    total_amount: money("2104.00"),
};

// NOTE WHAT IS *NOT* HERE: a negative amount. It is valid, and asserted as an acceptance in
// ACCEPTANCE_CASES below rather than rejected here — a clawback is an ordinary commission line and
// this is the one contract in the standard where the arrears `amount > 0` instinct is inverted.
// What is rejected is everything that would leave a statement unreconcilable or a line
// unattributable.
const COMMISSION_LINE_CASES = [
    {
        name: "a line with no adviser_code",
        why: "the rollup key — without it a payment cannot be attributed to any adviser at all",
        doc: (() => { const d = { ...commLineBase }; delete d.adviser_code; return d; })(),
    },
    {
        name: "a line with no line_id",
        why: "statements are re-fetchable, so a line with no identity gets counted twice",
        doc: (() => { const d = { ...commLineBase }; delete d.line_id; return d; })(),
    },
    {
        name: "a line with no commission_type",
        why: "an untyped line falls back to a per-insurer guess, the defect the vocabulary removes",
        doc: (() => { const d = { ...commLineBase }; delete d.commission_type; return d; })(),
    },
    {
        name: "a quoted policy_number",
        why: "the spreadsheet apostrophe splits one policy into two keys and the join half-matches",
        doc: { ...commLineBase, policy_number: "'P-4471902" },
    },
    {
        name: "an amount sent as a JSON number",
        why: "commission is summed to the cent against a bank deposit; a float drifts",
        doc: { ...commLineBase, amount: { amount: 2104.0, currency: "AUD" } },
    },
    {
        name: "an amount with three decimal places",
        why: "a statement total that reconciles to a third of a cent reconciles to nothing",
        doc: { ...commLineBase, amount: money("2104.005") },
    },
    {
        name: "a line carrying an unknown field",
        why: "a misspelled key must surface rather than being silently absorbed",
        doc: { ...commLineBase, gst: money("191.27") },
    },
];

const COMMISSION_STATEMENT_CASES = [
    {
        name: "a statement with no line_count",
        why: "half the reconciliation triple — without it a dropped line is undetectable",
        doc: (() => { const d = { ...statementBase }; delete d.line_count; return d; })(),
    },
    {
        name: "a statement with no total_amount",
        why: "the other half, and the only check that catches a dropped ROW rather than a dropped page",
        doc: (() => { const d = { ...statementBase }; delete d.total_amount; return d; })(),
    },
    {
        name: "a statement with no payee",
        why: "commission paid to nobody in particular reconciles against no bank account",
        doc: (() => { const d = { ...statementBase }; delete d.payee; return d; })(),
    },
    {
        name: "a statement with no statement_id",
        why: "the deduplication key; without it a re-fetched period doubles a book's commission",
        doc: (() => { const d = { ...statementBase }; delete d.statement_id; return d; })(),
    },
    {
        name: "a payee with no payee_id",
        why: "a name is not a key — two practices trade under the same one",
        doc: { ...statementBase, payee: { name: "Rivera Advice Pty Ltd" } },
    },
    {
        name: "a non-AUD currency",
        why: "only AUD is defined by this version, and a silently accepted currency mixes ledgers",
        doc: { ...statementBase, currency: "NZD" },
    },
];

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
    {
        name: "a quoted policy_id",
        why: "the spreadsheet-export leading apostrophe splits one policy into two reconciliation keys",
        doc: { ...policyBase, policy_id: "'P-4471902" },
    },
    {
        name: "a policy_id with surrounding whitespace",
        why: "same defect as quoting — the padded and bare forms are different keys and every join half-matches",
        doc: { ...policyBase, policy_id: " P-4471902 " },
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
    ["arrears worklist", validateArrearsPage, ARREARS_PAGE_CASES],
    ["requirements page", validateReqPage, REQ_PAGE_CASES],
    ["requirement", validateRequirement, REQUIREMENT_CASES],
    ["commission line", validateCommLine, COMMISSION_LINE_CASES],
    ["commission statement", validateStatement, COMMISSION_STATEMENT_CASES],
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

/**
 * The other direction: payloads that MUST be accepted.
 *
 * Almost everything in this file guards against a schema that is too permissive. These guard the
 * opposite mistake, and they exist because the commissions contract inverts a rule the rest of the
 * standard applies everywhere else. A negative amount is a defect in an arrears block and an
 * ordinary clawback on a commission line — so the obvious "tighten this to NonNegativeMoney" edit
 * looks like a correction, passes every other check in this file, and silently makes every clawback
 * in the market unrepresentable.
 */
const ACCEPTANCE_CASES = [
    {
        group: "commission line",
        name: "a negative amount (a clawback)",
        why: "the sign carries direction here; NonNegativeMoney would make clawbacks unrepresentable",
        validator: validateCommLine,
        doc: { ...commLineBase, amount: money("-780.40"), gst_amount: money("-70.95") },
    },
    {
        group: "commission line",
        name: "an advance repayment",
        why: "not commission at all, and negative — must survive both rules",
        doc: { ...commLineBase, commission_type: "advance_repayment", amount: money("-321.00") },
        validator: validateCommLine,
    },
    {
        group: "commission statement",
        name: "a statement whose total is negative",
        why: "a period where clawbacks exceeded earnings is unwelcome, not invalid",
        validator: validateStatement,
        doc: { ...statementBase, total_amount: money("-1240.00") },
    },
    {
        group: "commission line",
        name: "an unrecognised commission_type",
        why: "response enums are extensible; a new type must not fail the whole statement",
        validator: validateCommLine,
        doc: { ...commLineBase, commission_type: "renewal_bonus_tier_2" },
    },
    {
        group: "quoting request",
        name: "an insurer commission id on its own, with no basis",
        why: "the authoritative form; an id names one published option and needs nothing beside it",
        validator: validateRequest,
        doc: { insured, policy: { commission: { insurer_commission_id: "UF-0-22" } },
               covers: [life()] },
    },
    {
        group: "quoting request",
        name: "an insurer commission id alongside a basis and a dial-down",
        why: "both MAY be sent; the id wins and the insurer reports substituted if they disagree",
        validator: validateRequest,
        doc: { insured, covers: [life()],
               policy: { commission: { basis: "level", dial_down_percent: "25",
                                       insurer_commission_id: "LV-100" } } },
    },
    {
        group: "quoting response",
        name: "an applied commission with an id but no dial-down",
        why: "an option that is not a share of the standard cannot report one — 'upfront (0/22)' is "
            + "real, and approximating a percentage there would be priced on something else",
        validator: validateLine,
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            commission: { basis: "upfront", insurer_commission_id: "UF-0-22" },
        },
    },
    {
        group: "quoting response",
        name: "a line priced on an unrecognised commission basis",
        why: "the same asymmetry — closed on the request, extensible on the way back",
        validator: validateLine,
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            commission: { basis: "level_to_65" },
        },
    },
    {
        group: "quoting response",
        name: "a cover line on a different commission basis from its line",
        why: "one benefit written on level inside an upfront policy is the case the field exists for",
        validator: validateLine,
        doc: {
            ...lineBase,
            all_needs_met: true,
            premiums,
            rate_table_version: "2026-01",
            commission: { basis: "upfront", dial_down_percent: "0" },
            cover_lines: [
                { cover_type: "tpd", sum_insured: money("300000.00"), premiums, commission: { basis: "level" } },
            ],
        },
    },
];

let wronglyRejected = 0;
for (const { group, name, why, validator, doc: candidate } of ACCEPTANCE_CASES) {
    if (validator(candidate)) {
        console.log(`✓ accepted: ${group} — ${name}`);
    } else {
        wronglyRejected += 1;
        console.error(`✗ REJECTED — should have been accepted: ${group} — ${name}`);
        console.error(`    ${why}`);
        for (const err of (validator.errors ?? []).slice(0, 4)) {
            console.error(`    ${err.instancePath || "(root)"} ${err.message}`);
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
    POLICY_CASES.length +
    ARREARS_PAGE_CASES.length +
    REQ_PAGE_CASES.length +
    REQUIREMENT_CASES.length +
    COMMISSION_LINE_CASES.length +
    COMMISSION_STATEMENT_CASES.length;
console.log(`\n${total - wronglyAccepted}/${total} invalid payloads correctly rejected`);
console.log(
    `${ACCEPTANCE_CASES.length - wronglyRejected}/${ACCEPTANCE_CASES.length} valid payloads correctly accepted`,
);
process.exit(wronglyAccepted === 0 && wronglyRejected === 0 ? 0 : 1);
