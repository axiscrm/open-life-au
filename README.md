# Open Life Data Standards (AU)

Vendor-neutral contracts for Australian life insurance, so that adviser software and insurers can
integrate once instead of once per pair.

Two contracts:

| Contract | Status | What it covers |
|---|---|---|
| [**quoting**](domains/quoting/) | `v0.1.0` — draft, open for comment | Pricing life, TPD, trauma, income protection, business expenses, needle stick and child trauma cover |
| [**policy**](domains/policy/) | not started | In-force policy data, status changes and premium dishonours |

Licensed Apache-2.0. Everything here is a draft published for insurers to argue with — see
[Contributing](#contributing).

## Why

An insurer that wants to serve quotes to adviser software today has two options: build a bespoke API
and document it, or route through an aggregator. The first is expensive and produces an integration
only one consumer can use. The second works, but puts a third party between the insurer and its own
product data.

This is a third option: a contract that already exists, with generated server stubs, a runnable
mock, a test suite and published documentation. An insurer implements it once and every consumer of
the standard can read it.

Nothing here is speculative about whether insurers can produce this data — aggregators already
extract it from them. The question this answers is what shape it should arrive in.

## Design

**Modelled on the questions an adviser answers**, in the order they answer them: who is being
insured, then the answers that apply to the whole policy, then one section per benefit. Not modelled
on any existing engine's wire format — see [`docs/PROVENANCE-RULES.md`](docs/PROVENANCE-RULES.md).

**Typed covers, not an options bag.** Each of the seven covers is a closed schema discriminated on
`cover_type`, so an income-protection waiting period on a life cover is a `422` rather than a
silently ignored field. This is the main thing the standard does that a loose `options` object does
not, and `npm run rejections` asserts it.

**Occupations: ABS baseline, insurer matching.** A consumer sends an
[OSCA](https://abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/latest-release)
code plus risk qualifiers; the insurer matches it to its own occupation, prices on that, and echoes
back what it matched. Nobody in the value chain owns the taxonomy — the ABS does. See
[`taxonomy/PROVENANCE.md`](taxonomy/PROVENANCE.md).

**Privacy as a constraint.** No name, no address, no contact details, no health data, and `Insured`
is a closed schema so there is nowhere to put them. Age next birthday is preferred over date of
birth. A consumer sends the same client to several insurers, so every field multiplies into several
separate collections by several separate entities.

### The four rules that matter most

Each guards a **silent** failure — one that produces a plausible number rather than an error.

1. **All six payment frequencies on every priced line.** Sub-annual premiums carry a frequency
   loading, so monthly is not annual ÷ 12. A consumer that divides understates the cost and nothing
   looks wrong.
2. **Never price what you could not assemble.** If some requested covers cannot be written, return
   the line with `all_needs_met: false`, populated `errors`, and no premium. A partial policy priced
   as though complete reads as the best offer on the table.
3. **Report every option you did not apply.** An option the product cannot honour appears in
   `resolved_options` as `unsupported_ignored`. Otherwise a quote that quietly dropped a benefit is
   indistinguishable from one that included it.
4. **Echo what you rated.** `resolved_occupation` and `rate_table_version` are what make a quote
   reproducible months later, which is what an adviser needs to justify a recommendation.

## Layout

```
core/schemas/       shared by every contract — money, identifiers, problems, occupation, party
taxonomy/           the occupation baseline and the risk qualifiers layered over it
domains/quoting/    the quoting contract: openapi.yaml, paths/, components/, examples/
domains/policy/     the policy contract (not started)
dist/               committed bundles — this is what implementers consume
docs/               concepts, versioning, provenance rules
postman/            generated collection
scripts/            validation, rejection and provenance gates
```

`core/` is pure JSON Schema 2020-12 with no OpenAPI-only keywords, so the same schemas can back the
event-driven policy contract as well as the request/response quoting one.

## Working on it

```bash
npm ci
npm run verify      # lint, bundle, examples, rejections, provenance — everything CI runs
npm run mock        # serve a mock of the contract on :4010
npm run docs        # build the reference site into site/
npm run postman     # regenerate the collection
```

`npm run bundle` regenerates `dist/`. **Commit the result** — implementers link to `dist/`, and CI
fails if it drifts from source.

### For an insurer evaluating this

1. Read the reference documentation (`npm run docs`, or the published site).
2. Run `npm run mock` and point a client at `http://localhost:4010` to see the shapes in practice.
3. Read [`GET /capabilities`](domains/quoting/components/schemas/capabilities.yaml) — this is how you
   declare that you offer four covers and three waiting periods rather than everything. A partial
   implementation is a conformant implementation.
4. Generate a server stub. The contract is plain OpenAPI 3.1, so any generator works; for Java,
   `openapi-generator -g spring -p interfaceOnly=true` gives you interfaces to implement that
   regeneration will never overwrite.
5. Tell us what is wrong with it.

## Contributing

This is a draft, and the parts most likely to be wrong are the ones we had least evidence for.
Feedback that says "no insurer can produce this field" or "this option means something different in
our manual" is worth more than anything else you could send.

Open an issue. For anything touching a schema, say what an adviser is trying to express and what
your product actually offers — the contract should describe the market, not our assumptions about
it.

Changes are versioned per contract; see [`docs/VERSIONING.md`](docs/VERSIONING.md).
