# Open Life Data Standards (AU)

Vendor-neutral contracts for Australian life insurance, so that adviser software and insurers can
integrate once instead of once per pair.

**📖 Published reference: [axiscrm.github.io/open-life-au](https://axiscrm.github.io/open-life-au/)**

Four contracts:

| Contract | Status | Reference | What it covers |
|---|---|---|---|
| [**quoting**](domains/quoting/) | `v0.1.0` — draft, open for comment | [docs](https://axiscrm.github.io/open-life-au/quoting/) | Pricing life, TPD, trauma, income protection, business expenses, needle stick and child trauma cover |
| [**policy**](domains/policy/) | `v0.1.0` — draft, open for comment | [docs](https://axiscrm.github.io/open-life-au/policy/) | In-force policy data, the arrears worklist, and status changes |
| [**requirements**](domains/requirements/) | `v0.1.0` — draft, open for comment | [docs](https://axiscrm.github.io/open-life-au/requirements/) | Outstanding underwriting requirements on applications |
| [**commissions**](domains/commissions/) | `v0.1.0` — draft, open for comment | [docs](https://axiscrm.github.io/open-life-au/commissions/) | Commission statements and their lines |

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
core/schemas/       shared by every contract — money, identifiers, problems, occupation, party,
                    the snapshot envelope, distribution, and the cover/requirement/commission
                    vocabularies
core/http/          shared responses and headers, referenced by every contract
taxonomy/           the occupation baseline and the risk qualifiers layered over it
domains/quoting/    the quoting contract: openapi.yaml, paths/, components/, examples/
domains/policy/     the policy contract: snapshot pull, arrears worklist, optional webhooks
domains/requirements/  outstanding underwriting requirements, snapshot-first
domains/commissions/   commission statements and lines — a ledger, deliberately not a snapshot
dist/               committed bundles — this is what implementers consume
docs/               concepts, versioning, provenance rules
docs/generators/    one self-contained guide per language
postman/            generated collections, one per contract
scripts/            validation, rejection and provenance gates
```

`core/` is pure JSON Schema 2020-12 with no OpenAPI-only keywords, so the same schemas back the
event-driven parts of the policy and requirements contracts as well as the request/response quoting
one.

**Note that the commissions contract deliberately does not use the snapshot envelope.** It is a
ledger rather than a snapshot, so absence carries no meaning in it — see
[`domains/commissions/README.md`](domains/commissions/README.md), which explains why reusing the
envelope there would have invited a consumer to delete its own financial history.

## Working on it

```bash
npm ci
npm run verify      # lint, versions, bundle, examples, rejections, provenance
npm run mock        # mock every contract at once — :4010 quoting, :4011 policy, :4012 requirements, :4013 commissions
npm run mock:policy # or just one
npm run mock:check  # send every Postman collection request at the running mocks
npm run docs        # build the published site into site/ — every contract, plus the landing page
npm run postman     # regenerate the collections
npm run audit       # dependency advisories, via the reviewed-exceptions gate

# Generators — slower, so not part of `verify`. CI runs all six in parallel on every change.
#
# FIVE OF THE SIX NEED A JDK, not just the Java one: openapi-generator is a Java tool behind an
# npm wrapper and it also emits Ruby, Go, C# and one of the three TypeScript options. It does NOT
# need those languages installed — only Java. `.java-version` pins 21 to match CI; honoured by
# jenv, asdf and mise, and ignored harmlessly otherwise.
#
# On macOS, beware /usr/bin/java: it is a STUB that exists on PATH and reports "Unable to locate a
# Java Runtime" when called. `java -version` tells you the truth; `command -v java` does not.
npm run codegen               # all six, sequentially
npm run codegen:typescript    # needs Node, and a JDK for the typescript-fetch option
npm run codegen:python        # needs uv (or adapt to pipx/pip) — the only one with no JDK
npm run codegen:java          # needs a JDK
npm run codegen:csharp        # needs a JDK
npm run codegen:go            # needs a JDK
npm run codegen:ruby          # needs a JDK
```

The codegen checks exist because a valid OpenAPI document is not the same as a usable one, and this
contract leans on `oneOf` + `discriminator` + `unevaluatedProperties` — where generators diverge
either silently or catastrophically, never politely. They assert output was actually produced, since
more than one generator will exit `0` having written nothing.

`npm run bundle` regenerates `dist/`. **Commit the result** — implementers link to `dist/`, and CI
fails if it drifts from source.

### For an insurer evaluating this

1. Read the reference documentation (`npm run docs`, or the published site).
2. Run `npm run mock` and point a client at your contract's port — quoting `:4010`, policy `:4011`,
   requirements `:4012`, commissions `:4013` — to see the shapes in practice. Or import the matching
   [Postman collection](postman/), which already points at it.
3. Read `GET /capabilities` for the contract you are implementing — this is how you declare that you
   offer four covers and three waiting periods, or that you cannot report a sum insured, rather than
   shipping nulls and hoping. A partial implementation is a conformant implementation.
4. Generate stubs in your language — see [Generating stubs and clients](#generating-stubs-and-clients).
5. Tell us what is wrong with it.

## Generating stubs and clients

The contract is plain OpenAPI 3.1, so any generator will work. These six are run against every change
in CI, each with the exact flags needed — and the flags matter: every one is there because a default
produced something wrong.

Every guide covers all four contracts. [docs/generators/policy.md](docs/generators/policy.md) has
the cross-language notes for consuming a snapshot safely — read it for the requirements contract
too, which uses the same envelope and the same absence rule.

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
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/policy/openapi.yaml
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/requirements/openapi.yaml
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/commissions/openapi.yaml
```

If a generator misbehaves, that is a defect in the contract rather than in your setup — please tell
us. It has happened three times already, and every time the fix was ours; see
[docs/generators/](docs/generators/#if-a-generator-misbehaves).

## Contributing

This is a draft, and the parts most likely to be wrong are the ones we had least evidence for.
Feedback that says "no insurer can produce this field" or "this option means something different in
our manual" is worth more than anything else you could send.

Open an issue. For anything touching a schema, say what an adviser is trying to express and what
your product actually offers — the contract should describe the market, not our assumptions about
it.

Changes are versioned per contract; see [`docs/VERSIONING.md`](docs/VERSIONING.md).
