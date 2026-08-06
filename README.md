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
npm run verify      # lint, bundle, examples, rejections, provenance
npm run mock        # serve a mock of the contract on :4010
npm run docs        # build the reference site into site/
npm run postman     # regenerate the collection
npm run audit       # dependency advisories, via the reviewed-exceptions gate

# Generators — slower, so not part of `verify`. CI runs all three on every change.
npm run codegen:typescript    # needs Node
npm run codegen:python        # needs uv (or adapt to pipx/pip)
npm run codegen:java          # needs a JDK 17+
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

The contract is plain OpenAPI 3.1, so you are not tied to the generators below — but they are the
three we run against every change in CI, with the flags that follow. Those flags are not decoration:
each one is there because the default produced something wrong, and each is noted with why.

**What you generate from** is `dist/quoting/openapi.yaml` — a single self-contained file with every
`$ref` already resolved. Take that one file; you do not need to clone this repository.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
```

Prerequisites are per language: Node 20+ for TypeScript, Python 3.12+ for Python, and a JDK 17+ for
Java (the Java generator itself is distributed via npm, so you need Node for that too).

### TypeScript

```bash
npx openapi-typescript@7 openapi.yaml \
  --default-non-nullable=false \
  -o src/openlife-quoting.d.ts
```

> `--default-non-nullable=false` is **required**, not optional. Without it, any property carrying a
> schema `default` is emitted as *required* — so `campaign_codes`, `structure`, `ownership` and
> `premium_waiver` all become mandatory, and a perfectly valid minimal request fails to compile.

You get types only, with no runtime. Pair them with [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/)
for a typed client in about 6 kB:

```ts
import createClient from "openapi-fetch";
import type { paths, components } from "./openlife-quoting";

const client = createClient<paths>({ baseUrl: "https://api.example.com.au/openlife/quoting/v1" });
const { data, error } = await client.POST("/quotes", { body: quoteRequest });
```

The cover union narrows on `cover_type`, so the compiler enforces the same rules the schema does —
an income-protection waiting period on a life cover, money as a number, or an unrecognised
`structure` are all compile errors.

*If you are working inside a clone of this repo,* run `npm run codegen:typescript` instead. A bare
`npx openapi-typescript openapi.yaml` fails there, because the tool also reads `redocly.yaml` and
prefers its `apis` block over the path you passed.

### Python

```bash
uvx --from datamodel-code-generator datamodel-codegen \
  --input openapi.yaml --input-file-type openapi \
  --output openlife_quoting/models.py \
  --output-model-type pydantic_v2.BaseModel \
  --use-standard-collections --use-union-operator \
  --field-constraints --use-annotated \
  --target-python-version 3.12
```

(`pipx run` or a plain `pip install datamodel-code-generator` work equally well.)

You get Pydantic v2 models. `CoverRequest` comes out as a proper discriminated union
(`Field(discriminator='cover_type')`), so validation rejects an option that belongs to another
cover, and money round-trips as an exact string — `"1000000.00"` in, `"1000000.00"` out, never a
float.

```python
from openlife_quoting.models import QuoteRequest
request = QuoteRequest.model_validate(payload)     # raises on an invalid cover
```

These are models, not a client. Add ~200 lines of `httpx` over the top with your OAuth2 token cache,
or use [`openapi-python-client`](https://github.com/openapi-generators/openapi-python-client) if you
want a full generated client — note it emits `attrs` models rather than Pydantic.

### Java

```bash
# Server: interfaces for you to implement
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g spring -o ./generated-server \
  -p interfaceOnly=true,useSpringBoot3=true,useTags=true,useJakartaEe=true,openApiNullable=false \
  --additional-properties=apiPackage=au.org.openlife.quoting.api,modelPackage=au.org.openlife.quoting.model

# Client
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g java -o ./generated-client --library native \
  -p openApiNullable=false,useJakartaEe=true \
  --additional-properties=apiPackage=au.org.openlife.quoting.api,modelPackage=au.org.openlife.quoting.model
```

Two flags carry most of the weight:

- **`interfaceOnly=true`** means you implement a generated `QuotesApi` interface. Regenerating never
  touches your code, so you can take a new contract version without a merge. Each method defaults to
  `501 Not Implemented`, which makes a partial implementation a compiling one.
- **`--library native`** uses the JDK's own `HttpClient`. No transitive OkHttp or Gson pins, which is
  one fewer conversation with your platform team.

```java
@RestController
public class QuotingController implements QuotesApi {
    @Override
    public ResponseEntity<QuoteResponse> createQuote(QuoteRequest request, UUID idempotencyKey, String requestId) {
        return ResponseEntity.ok(pricingEngine.price(request));
    }
}
```

Verified against openapi-generator **7.24.0**: `CoverRequest` generates with Jackson
`@JsonTypeInfo`/`@JsonSubTypes` polymorphism on `cover_type`, and `Money.amount` is a `String` — so
convert to `BigDecimal`, never `double`, or premiums drift by cents.

Maven Central coordinates are not published yet. Generate locally for now, or ask and we will
prioritise it.

### If a generator misbehaves

Tell us — that is a defect in the contract, not in your setup.

This has already happened once. The cover discriminant was originally pinned with `const`, which is
correct JSON Schema and reads better; openapi-generator resolves a discriminator through the
variant's *allowable values*, which only `enum` populates, so it died with a NullPointerException
and emitted **nothing at all** — no models, no interfaces. Every Java implementer would have been
blocked, and neither lint nor schema validation noticed. Hence the CI matrix that now runs all three
generators on every change.

## Contributing

This is a draft, and the parts most likely to be wrong are the ones we had least evidence for.
Feedback that says "no insurer can produce this field" or "this option means something different in
our manual" is worth more than anything else you could send.

Open an issue. For anything touching a schema, say what an adviser is trying to express and what
your product actually offers — the contract should describe the market, not our assumptions about
it.

Changes are versioned per contract; see [`docs/VERSIONING.md`](docs/VERSIONING.md).
