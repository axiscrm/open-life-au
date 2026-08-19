# Python

Two routes, and they suit different situations:

| | [`datamodel-code-generator`](https://koxudaxi.github.io/datamodel-code-generator/) | [`openapi-python-client`](https://github.com/openapi-generators/openapi-python-client) |
|---|---|---|
| Output | one `.py` module | a package, one module per model |
| Models | Pydantic v2 | `attrs` |
| HTTP client | none — bring your own | generated, over `httpx` |
| Best when | you already use Pydantic, or you are implementing the server | you want a working client quickly |

Both are run against every change in CI. Verified against **datamodel-code-generator 0.36** and
**openapi-python-client 0.26**.

## Prerequisites

Python 3.12 or later. The commands below use [`uv`](https://docs.astral.sh/uv/); `pipx run` or a
plain `pip install` into a virtualenv work identically.

## Get the contracts

Both are self-contained — every `$ref` already resolved — so these two files are all you need. You do
not need to clone this repository.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/policy/openapi.yaml
```

Generate them as two separate packages. Every command below shows quoting; substitute
`policy/openapi.yaml` and a different package name for the other. See
[policy.md](policy.md) for what differs — in particular the snapshot walk, which is the one piece of
client logic that is dangerous to get wrong.

## Option 1 — Pydantic models

```bash
uvx --from datamodel-code-generator datamodel-codegen \
  --input openapi.yaml --input-file-type openapi \
  --output openlife_quoting/models.py \
  --output-model-type pydantic_v2.BaseModel \
  --use-standard-collections --use-union-operator \
  --field-constraints --use-annotated \
  --use-schema-description --use-field-description \
  --target-python-version 3.12
```

> **`--use-schema-description --use-field-description` are what give you documentation.**
>
> Without them the contract's descriptions land only inside `Field(...)` metadata and every class
> arrives with no docstring at all — which matters more here than in most contracts, because the
> descriptions carry rules the types cannot. The loadings map is the clearest case: a benefit
> present with `0` means "explicitly no loading", a benefit absent means "no instruction", and
> nothing in the type system tells you that.

The output is a single module. `datamodel-code-generator` mirrors its input, so passing a directory
to `--output` still produces one file — if you want a package, use option 2.

### Using them

```python
from decimal import Decimal
from openlife_quoting.models import QuoteRequest, QuoteResponse

request = QuoteRequest.model_validate(payload)   # raises on an invalid cover
```

`CoverRequest` is a real discriminated union — `Field(discriminator='cover_type')` — so Pydantic
rejects an option belonging to another cover rather than quietly ignoring it, and error messages
point at the specific variant instead of listing all seven failures.

Money round-trips exactly:

```python
request.covers[0].sum_insured.amount     # '1000000.00' — str, not float
Decimal(request.covers[0].sum_insured.amount)
```

### A client

There is no generated client on this route. A thin `httpx` wrapper is usually 200 lines or so; the
part worth getting right is caching the OAuth2 token rather than minting one per quote:

```python
import time, httpx
from openlife_quoting.models import QuoteRequest, QuoteResponse

class QuotingClient:
    def __init__(self, base_url, token_url, client_id, client_secret):
        self._c = httpx.AsyncClient(base_url=base_url, timeout=15.0)
        self._token_url, self._id, self._secret = token_url, client_id, client_secret
        self._token, self._expires_at = None, 0.0

    async def _access_token(self) -> str:
        # Refresh at 80% of the lifetime so a request never races an expiry.
        if self._token and time.monotonic() < self._expires_at:
            return self._token
        r = await self._c.post(self._token_url, data={
            "grant_type": "client_credentials",
            "client_id": self._id, "client_secret": self._secret,
            "scope": "quotes.write capabilities.read occupations.read",
        })
        r.raise_for_status()
        payload = r.json()
        self._token = payload["access_token"]
        self._expires_at = time.monotonic() + payload.get("expires_in", 3600) * 0.8
        return self._token

    async def create_quote(self, request: QuoteRequest, idempotency_key: str) -> QuoteResponse:
        r = await self._c.post(
            "/quotes",
            content=request.model_dump_json(exclude_none=True),
            headers={
                "Authorization": f"Bearer {await self._access_token()}",
                "Content-Type": "application/json",
                "Idempotency-Key": idempotency_key,
            },
        )
        r.raise_for_status()
        return QuoteResponse.model_validate(r.json())
```

`exclude_none=True` matters. An explicit `null` is not the same as an omitted field — most obviously
in the loadings maps, where presence is the whole signal.

### Implementing the server

The same models work with FastAPI, which will also serve a schema closely matching this contract:

```python
from fastapi import FastAPI
from openlife_quoting.models import QuoteRequest, QuoteResponse

app = FastAPI()

@app.post("/quotes", response_model=QuoteResponse)
async def create_quote(request: QuoteRequest) -> QuoteResponse:
    ...
```

For generated route stubs rather than hand-written ones, see
[`fastapi-code-generator`](https://github.com/koxudaxi/fastapi-code-generator).

## Option 2 — a full client package

```bash
uvx --from openapi-python-client openapi-python-client generate --path openapi.yaml
```

You get a package with a configured `httpx` client, one module per model, and typed calls per
operation. Models are `attrs`, not Pydantic — worth knowing if the rest of your codebase is
Pydantic, since the two do not compose.

> **Check the output before you trust it.**
>
> On a construct it does not support, this tool prints a short notice, drops the affected schema,
> and **still exits successfully**. That has already bitten this contract once: it dropped TPD,
> trauma and business expenses while writing 79 healthy-looking files, and the exit code was `0`.
>
> The contract has been changed so it no longer happens, and CI now asserts every cover survives.
> Verify anyway — it costs one command:
>
> ```bash
> ls open_life_quoting_api_au_client/models/*_cover.py | wc -l   # expect 7
> ```

## Nuances worth knowing

**Money is a string, deliberately.** Convert with `Decimal(...)`, never `float(...)`. Premiums are
summed and compared to the cent, and float drift in a comparison table is a compliance problem.

**Read the frequency you need; never divide.** Sub-annual premiums include a frequency loading, so
`annual / 12` is not the monthly premium. It will be noticeably low and nothing will look wrong.

`line.premiums` carries `monthly` and `annual` always; the other four are `None` where the insurer
does not quote that frequency, and those are listed in `line.premiums.not_quoted`. `None` means the
frequency cannot be bought at any price, so dividing produces a figure that is both wrong and
unpurchasable — disable the control instead.

**A line with `all_needs_met=False` is not an offer.** `premiums` is absent entirely, so a
price-ordered sort must filter those out first or a failed line sorts to the top as though free.

**Check `resolved_options` before claiming a benefit is included.** An option the product could not
honour appears there as `unsupported_ignored`, and the premium does not include it.

## Troubleshooting

**`Cannot take allOf a non-object`, and TpdCover / TraumaCover / BusinessExpensesCover removed**

You are generating from a copy of the contract taken before this was fixed. Confirm with
[Am I on the current contract?](README.md#am-i-on-the-current-contract) and re-download.

Note that `info.version` will not help you here — it reads `0.1.0` in both the broken and the fixed
file, because the contract has not had its first release yet. A quick local tell: the fixed file
contains the phrase `A subset of`, which the old one does not.

```bash
grep -q "A subset of" openapi.yaml && echo "current" || echo "STALE — re-download"
```

The cause, for the record: those three covers narrowed a shared enum with
`allOf: [$ref to the full enum, {enum: [subset]}]`. This tool rejects that construct, drops the whole
schema, and **still exits successfully** — so a stale copy gives you a client silently missing three
of the seven covers. The contract now spells the subsets out inline, and CI asserts all seven
survive every generator.

**Enum members named `field_14d`** — expected. `datamodel-code-generator` prefixes identifiers that
cannot start with a digit. The wire values are unchanged.

**`FutureWarning` about default formatters** — harmless. Pass `--formatters black` to silence it.

**Models resolve to `Any`** — check you generated from `dist/quoting/openapi.yaml` rather than
`domains/quoting/openapi.yaml`. The latter is the split source and needs its `$ref`s bundled first.
