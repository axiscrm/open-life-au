# TypeScript

Types via [`openapi-typescript`](https://openapi-ts.dev/), a client via
[`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/). Types are generated; the runtime is about
6 kB and hand-wired, which is why there is no generated client tree to keep in sync.

Verified against **openapi-typescript 7.13**.

## Prerequisites

Node 20 or later. Nothing else.

## Get the contract

`dist/quoting/openapi.yaml` is self-contained — every `$ref` already resolved — so this one file is
all you need.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
```

## Generate

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

You get one `.d.ts` file with no runtime and no dependencies. There is no multi-file mode — for a
file-per-model tree with a generated client, use [`@hey-api/openapi-ts`](https://heyapi.dev/) or
`openapi-generator -g typescript-fetch`.

Documentation comes through as JSDoc on every schema and property, so descriptions surface on hover
in an editor without anyone reading the YAML.

## A typed client

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

**Types resolve to `unknown`** — check you generated from `dist/quoting/openapi.yaml` and not from
`domains/quoting/openapi.yaml`. The latter is the split source and needs its `$ref`s bundled first.
