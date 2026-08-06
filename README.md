# Open Life Data Standards (AU)

Vendor-neutral contracts for Australian life insurance, so that adviser software and insurers can
integrate once instead of once per pair.

Two contracts:

| Contract | Status | What it covers |
|---|---|---|
| [**quoting**](domains/quoting/) | `v0.1.0` — draft, open for comment | Pricing life, TPD, trauma, income protection, business expenses, needle stick and child trauma cover |
| [**policy**](domains/policy/) | `v0.1.0` — draft, open for comment | In-force policy data, arrears and status changes |

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
core/http/          shared responses and headers, referenced by both contracts
taxonomy/           the occupation baseline and the risk qualifiers layered over it
domains/quoting/    the quoting contract: openapi.yaml, paths/, components/, examples/
domains/policy/     the policy contract: snapshot pull, arrears, optional webhooks
dist/               committed bundles — this is what implementers consume
docs/               concepts, versioning, provenance rules
docs/generators/    one self-contained guide per language
postman/            generated collection
scripts/            validation, rejection and provenance gates
```

`core/` is pure JSON Schema 2020-12 with no OpenAPI-only keywords, so the same schemas can back the
event-driven policy contract as well as the request/response quoting one.

## Working on it

```bash
npm ci
npm run verify      # lint, bundle, examples, rejections, provenance
npm run mock        # serve a mock of the contract on :4010
npm run docs        # build the reference site into site/
npm run postman     # regenerate the collection
npm run audit       # dependency advisories, via the reviewed-exceptions gate

# Generators — slower, so not part of `verify`. CI runs all six in parallel on every change.
npm run codegen               # all six, sequentially
npm run codegen:typescript    # needs Node, and a JDK for the typescript-fetch option
npm run codegen:python        # needs uv (or adapt to pipx/pip) — the only one with no JDK
npm run codegen:java          # needs a JDK 17+
npm run codegen:csharp        # needs a JDK 17+
npm run codegen:go            # needs a JDK 17+
npm run codegen:ruby          # needs a JDK 17+
```

The codegen checks exist because a valid OpenAPI document is not the same as a usable one, and this
contract leans on `oneOf` + `discriminator` + `unevaluatedProperties` — where generators diverge
either silently or catastrophically, never politely. They assert output was actually produced, since
more than one generator will exit `0` having written nothing.

`npm run bundle` regenerates `dist/`. **Commit the result** — implementers link to `dist/`, and CI
fails if it drifts from source.

### For an insurer evaluating this

1. Read the reference documentation (`npm run docs`, or the published site).
2. Run `npm run mock` and point a client at `http://localhost:4010` to see the shapes in practice.
3. Read [`GET /capabilities`](domains/quoting/components/schemas/capabilities.yaml) — this is how you
   declare that you offer four covers and three waiting periods rather than everything. A partial
   implementation is a conformant implementation.
4. Generate stubs in your language — see [Generating stubs and clients](#generating-stubs-and-clients).
5. Tell us what is wrong with it.

## Generating stubs and clients

The contract is plain OpenAPI 3.1, so any generator will work. These six are run against every change
in CI, each with the exact flags needed — and the flags matter: every one is there because a default
produced something wrong.

| Language | Guide | You get |
|---|---|---|
| Java | [docs/generators/java.md](docs/generators/java.md) | Spring interfaces to implement + a client |
| C# / .NET | [docs/generators/csharp.md](docs/generators/csharp.md) | ASP.NET Core controllers + a client |
| TypeScript | [docs/generators/typescript.md](docs/generators/typescript.md) | types only, a generated SDK, or runtime converters |
| Python | [docs/generators/python.md](docs/generators/python.md) | Pydantic models, or a full client package |
| Go | [docs/generators/go.md](docs/generators/go.md) | `net/http` or Gin stubs + a client |
| Ruby | [docs/generators/ruby.md](docs/generators/ruby.md) | a client gem |

Each guide stands alone — prerequisites, fetching the contract, the command, and the traps specific
to that toolchain. See [docs/generators/](docs/generators/) for the comparison, including which
generators produce a single file versus a package, and how to add another.

You generate from `dist/quoting/openapi.yaml`, a single self-contained file. No need to clone this
repository:

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
```

If a generator misbehaves, that is a defect in the contract rather than in your setup — please tell
us. It has happened twice already, and both times the fix was ours; see
[docs/generators/](docs/generators/#if-a-generator-misbehaves).

## Contributing

This is a draft, and the parts most likely to be wrong are the ones we had least evidence for.
Feedback that says "no insurer can produce this field" or "this option means something different in
our manual" is worth more than anything else you could send.

Open an issue. For anything touching a schema, say what an adviser is trying to express and what
your product actually offers — the contract should describe the market, not our assumptions about
it.

Changes are versioned per contract; see [`docs/VERSIONING.md`](docs/VERSIONING.md).
