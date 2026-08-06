# TypeScript

Three routes, all run against every change in CI. They differ mainly in how much code you want
generated versus written.

| | [`openapi-typescript`](https://openapi-ts.dev/) | [`@hey-api/openapi-ts`](https://heyapi.dev/) | [`openapi-generator -g typescript-fetch`](https://openapi-generator.tech/docs/generators/typescript-fetch/) |
|---|---|---|---|
| Output | one `.d.ts` | 16 files | ~67 files, one model each |
| What you get | types only | types + generated SDK | types + SDK + runtime converters |
| Runtime | `openapi-fetch`, ~6 kB, you wire it | generated client | generated, with `FromJSON`/`ToJSON` per model |
| Extra prerequisite | none | TypeScript 5.x peer | a JDK |
| Best when | you want types and control | you want a working SDK quickly | you want runtime parsing, or match an existing house style |

Start with `openapi-typescript` unless you have a reason not to — least generated code to keep in
sync. Verified against **openapi-typescript 7.13**, **@hey-api/openapi-ts 0.99**, and
**openapi-generator 7.24**.

## Prerequisites

Node 20 or later. The two alternatives each add one thing, noted in their sections.

## Get the contract

`dist/quoting/openapi.yaml` is self-contained — every `$ref` already resolved — so this one file is
all you need.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
```

## Option 1 — `openapi-typescript` (types only)

```bash
npx openapi-typescript@7 openapi.yaml \
  --default-non-nullable=false \
  -o src/openlife-quoting.d.ts
```

> **`--default-non-nullable=false` is required, not optional.**
>
> Without it, any property carrying a schema `default` is emitted as *required*. In this contract
> that hits `campaign_codes`, and `structure`, `ownership` and `premium_waiver` inside
> `PolicyDefaults` — all genuinely optional, all with a documented default. A minimal valid request
> then fails to compile with `Property 'campaign_codes' is missing`.
>
> The flag's reasoning is sound in one direction: a defaulted field will always be *present* in a
> response, so treating it as non-nullable when reading is right. It just applies the same rule to
> request bodies, where it is wrong.

You get one `.d.ts` file with no runtime and no dependencies. There is no multi-file mode by design —
it emits types, so there is nothing to split. For a file-per-model tree, see options 2 and 3.

Documentation comes through as JSDoc on every schema and property, so descriptions surface on hover
in an editor without anyone reading the YAML.

### A typed client

```bash
npm install openapi-fetch
```

```ts
import createClient from "openapi-fetch";
import type { paths, components } from "./openlife-quoting";

const client = createClient<paths>({
  baseUrl: "https://api.example.com.au/openlife/quoting/v1",
  headers: { Authorization: `Bearer ${accessToken}` },
});

const { data, error, response } = await client.POST("/quotes", {
  body: quoteRequest,
  headers: { "Idempotency-Key": crypto.randomUUID() },
});

if (error) {
  // RFC 9457 problem document — branch on `type`, never on the human-readable text.
  console.error(error.type, error.detail);
} else {
  for (const line of data.lines) {
    if (!line.all_needs_met) continue;         // not an offer; see below
    console.log(line.product_name, line.premiums.monthly.total.amount);
  }
}
```

`error` is typed as the `Problem` schema, so the problem-type registry is available to switch on.

## What the types buy you

The cover union narrows on `cover_type`, so the compiler enforces the same rules the schema does.
All four of these are compile errors:

```ts
type Cover = components["schemas"]["CoverRequest"];

// error TS2353: 'waiting_period' does not exist in type ...
const a: Cover = { cover_id: "l1", cover_type: "life",
  sum_insured: { amount: "1.00", currency: "AUD" }, waiting_period: "90d" };

// error TS2322: Type 'number' is not assignable to type 'string'
const b: Cover = { cover_id: "l1", cover_type: "life",
  sum_insured: { amount: 1000000, currency: "AUD" } };

// error TS2820: Type '"level_60"' is not assignable ... Did you mean '"level_65"'?
const c: Cover = { cover_id: "l1", cover_type: "life",
  sum_insured: { amount: "1.00", currency: "AUD" }, structure: "level_60" };

// error: 'cover_type' is missing
const d: Cover = { cover_id: "l1", sum_insured: { amount: "1.00", currency: "AUD" } };
```

And narrowing exposes only the options belonging to that cover:

```ts
function waitingPeriod(cover: Cover): string | undefined {
  if (cover.cover_type === "income_protection") {
    return cover.waiting_period;        // available here, and nowhere else
  }
  return undefined;
}
```

## Option 2 — `@hey-api/openapi-ts` (types + a generated SDK)

The maintained successor to `openapi-typescript-codegen`. Multi-file output with a generated
function per operation, so you write no HTTP plumbing.

**Extra prerequisite: a TypeScript 5.x peer dependency.** It drives the TypeScript compiler API, and
on 7.x it fails immediately with `TypeError: Cannot read properties of undefined (reading
'AnyKeyword')` — the native port does not expose the same surface. `npm i -D typescript@5` before
you start, and pin it; a floating `typescript@latest` will break this the day 7 becomes the default.

```bash
npm i -D @hey-api/openapi-ts typescript@5
npx @hey-api/openapi-ts -i openapi.yaml -o src/client
```

Sixteen files:

```
src/client/
├── types.gen.ts     every schema
├── sdk.gen.ts       one function per operation
├── client.gen.ts    the configured fetch client
├── index.ts
└── core/            serialisers, auth, params
```

Operation names come from `operationId`, so they read the way the contract does:

```ts
import { createQuote, getCapabilities } from "./client";
import { client } from "./client/client.gen";

client.setConfig({
  baseUrl: "https://api.example.com.au/openlife/quoting/v1",
  headers: { Authorization: `Bearer ${accessToken}` },
});

const { data, error } = await createQuote({
  body: quoteRequest,
  headers: { "Idempotency-Key": crypto.randomUUID() },
});
```

The cover union survives with the discriminant tagged explicitly, which narrows exactly as option 1
does:

```ts
export type CoverRequest =
  ({ cover_type: 'life' } & LifeCover) |
  ({ cover_type: 'tpd' } & TpdCover) | ...
```

`Decimal` is emitted as `export type Decimal = string`, so money stays exact.

**Set `moduleResolution` to `bundler`** (or `node16`/`nodenext` with `allowImportingTsExtensions`).
The generated imports are extensionless, so a strict `nodenext` setup reports `Cannot find module
'./sdk.gen'`. With `bundler` it compiles clean under `--strict`.

## Option 3 — `openapi-generator -g typescript-fetch` (one model per file)

Choose this if you want runtime parsing rather than compile-time types alone, or if your
organisation already standardises on openapi-generator across languages and you want the TypeScript
output to match the Java house style.

**Extra prerequisite: a JDK 17+.** openapi-generator is a Java tool behind an npm wrapper.

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g typescript-fetch -o ./src/client \
  -p supportsES6=true,modelPropertyNaming=original
```

> **`modelPropertyNaming=original` is worth passing.** The default camel-cases property names, so
> `sum_insured` becomes `sumInsured` in your code while the wire format keeps the snake case. That
> works — the runtime converters translate both ways — but it means the field names in your code no
> longer match the contract, the examples, or anything an insurer's support desk will quote back at
> you. Keeping them identical costs nothing.

About 67 files, one model per file, plus `runtime.ts` and an API class per tag. Unlike the other two
options you get real runtime behaviour:

```ts
import { QuotesApi, Configuration, CoverRequestFromJSON } from "./client";

const api = new QuotesApi(new Configuration({
  basePath: "https://api.example.com.au/openlife/quoting/v1",
  accessToken: async () => accessToken,
}));

const quote = await api.createQuote({ quoteRequest, idempotencyKey: crypto.randomUUID() });
```

Every model ships `FromJSON` / `ToJSON` converters, and `CoverRequestFromJSON` dispatches on
`cover_type` to the right variant. That is genuinely useful for the response side: it gives you a
place to catch a payload that does not match the contract, rather than discovering it three layers
later when a field is `undefined`.

`Money.amount` is typed `string`, as it must be.

## Nuances worth knowing

**Money is a string, deliberately.** `{ amount: "1000000.00", currency: "AUD" }`. Do not
`parseFloat` it to add up premiums — JavaScript numbers are IEEE-754 doubles and a comparison table
that drifts by cents is a compliance problem, not a rounding nit. Use a decimal library
([`decimal.js`](https://mikemcl.github.io/decimal.js/), [`dinero.js`](https://dinerojs.com/)) or
work in integer cents:

```ts
const cents = (m: components["schemas"]["Money"]) => Math.round(Number(m.amount) * 100);
```

**Read the frequency you need; never divide.** `line.premiums` carries all six, and sub-annual
premiums include a frequency loading, so `annual / 12` is not the monthly premium. It will be
noticeably low and nothing will look wrong.

**A line with `all_needs_met: false` is not an offer.** It has no `premiums` at all. Filter those
before sorting by price, or a failed line will sort to the top as though it were free.

**Check `resolved_options` before claiming a benefit is included.** An option the product could not
honour appears there as `unsupported_ignored`, and the premium does not include it.

## Troubleshooting

**`API quoting is missing an 'x-openapi-ts.output' key`**

You are running inside a clone of this repository. `openapi-typescript` also reads `redocly.yaml`,
and when it finds an `apis` block it uses that in preference to the path you passed — then refuses
to run without an output location. Use the repo's own script instead:

```bash
npm run codegen:typescript
```

In your own project there is no `redocly.yaml`, so the plain CLI form works.

**`Property 'campaign_codes' is missing`** — you omitted `--default-non-nullable=false`. See above.

**`TypeError: Cannot read properties of undefined (reading 'AnyKeyword')`** (hey-api)

You have TypeScript 7 installed. `@hey-api/openapi-ts` drives the TypeScript compiler API and the
native port does not expose the same surface. Install `typescript@5` and pin it — a floating
`typescript@latest` will reintroduce this the day 7 becomes the default.

**`Cannot find module './sdk.gen'`** (hey-api)

Set `moduleResolution` to `bundler`. The generated imports are extensionless, which a strict
`nodenext` configuration rejects.

**Property names are camelCase but the wire format is snake_case** (typescript-fetch)

Expected, unless you passed `modelPropertyNaming=original`. The runtime converters translate both
ways so it works either way, but keeping the names identical to the contract makes your code
searchable against the documentation and the examples.

**Types resolve to `unknown`** — check you generated from `dist/quoting/openapi.yaml` and not from
`domains/quoting/openapi.yaml`. The latter is the split source and needs its `$ref`s bundled first.
