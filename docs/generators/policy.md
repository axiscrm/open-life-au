# Generating from the policy contract

The per-language pages cover the mechanics — prerequisites, flags, traps. Everything there applies
to every contract; you change one input path and one package name:

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/policy/openapi.yaml
```

This page covers what is **different** about generating from policy, and the one piece of client
logic that is easy to get catastrophically wrong.

> **Applies to the requirements contract as well.** `GET /cases` returns the same snapshot envelope
> from `core/schemas/snapshot.yaml` under the same absence rule, so the snapshot walk below is the
> walk you need there too — substitute `dist/requirements/openapi.yaml`, `cases` for `policies` and
> `case_id` for `policy_id`. Everything about why a partial walk is dangerous carries over
> unchanged; only the consequence differs, closing live requirements rather than lapsing policies.

## Several contracts, side by side

Generate each as its own package. They share `core/` schemas by `$ref`, but each bundle is
self-contained, so the generated types will be duplicated across them — that is fine and
deliberate. Do not try to merge them into one package: the shared names (`Money`, `Problem`,
`CoverType`) are identical today, but the contracts version independently and will drift.

```bash
# TypeScript
npx openapi-typescript@7 quoting.yaml --default-non-nullable=false -o src/quoting.d.ts
npx openapi-typescript@7 policy.yaml  --default-non-nullable=false -o src/policy.d.ts

# Python
uvx --from datamodel-code-generator datamodel-codegen \
  --input policy.yaml --input-file-type openapi \
  --output openlife/policy_models.py --output-model-type pydantic_v2.BaseModel \
  --use-standard-collections --use-union-operator --field-constraints --use-annotated \
  --use-schema-description --use-field-description --target-python-version 3.12

# Java
npx @openapitools/openapi-generator-cli@2 generate \
  -i policy.yaml -g spring -o ./generated-policy-server \
  -p interfaceOnly=true,useSpringBoot3=true,useJakartaEe=true,openApiNullable=false \
  --additional-properties=apiPackage=au.org.openlife.policy.api,modelPackage=au.org.openlife.policy.model
```

C#, Go and Ruby follow the same substitution — see their pages.

## The `webhooks` block

The policy contract declares three optional webhooks using OpenAPI 3.1's native `webhooks` object.
Most generators ignore it, some emit receiver stubs, none require you to use it.

One thing to know if you are reading the source rather than `dist/`: each webhook operation carries a
meaningless `x-openlife-webhook: true` extension. **It must stay.** openapi-generator's Spring target
dereferences `Operation.getExtensions()` without a null check when processing webhooks, and a webhook
operation with no extensions returns null — producing a NullPointerException that aborts the entire
run and emits nothing at all. Verified against 7.24.0: without the extension, 0 files; with it, a
full generation.

## Walking a snapshot safely

This is the part worth writing carefully, and the reason this page exists.

`GET /policies` returns the whole book, paged. Reconciliation depends on absence: a policy you hold
that is **not** in the new snapshot is no longer in force. That is the property that makes a snapshot
worth pulling — no tombstones, no missed events, and a failed run is fixed by the next one.

It is only sound once the **entire** walk has completed. A walk that dies on page nine makes every
unfetched policy look absent, and reconciling off it will lapse most of a book — from responses that
are individually valid and completely wrong.

So before you act on absence, check four things:

1. `mode` is `full` on every page — an incremental response says nothing about absence;
2. you reached a page with `complete: true`, and no page carried `complete: true` alongside a
   `next_cursor`;
3. every page carried the same `snapshot_id` and the same `total_count`;
4. the number of **distinct** `policy_id`s you assembled equals `total_count`.

If any fails, discard the run and keep what you had. A stale book beats a wrongly-lapsed one.

### TypeScript

```ts
import createClient from "openapi-fetch";
import type { paths, components } from "./policy";

type Policy = components["schemas"]["Policy"];
const client = createClient<paths>({ baseUrl, headers: { Authorization: `Bearer ${token}` } });

async function pullSnapshot(): Promise<Policy[]> {
  const policies: Policy[] = [];
  let snapshotId: string | undefined;
  let cursor: string | undefined;
  let complete = false;
  let expected: number | undefined;

  do {
    const { data, error } = await client.GET("/policies", {
      params: { query: { cursor, snapshot_id: snapshotId, limit: 250 } },
    });
    if (error) throw new Error(`snapshot failed: ${error.type}`);

    // An incremental response is byte-identical in shape to a full one, so this is the only thing
    // standing between a stray `changed_since` and lapsing everything that did not change.
    if (data.mode !== "full") throw new Error("not a full snapshot — absence carries no meaning");

    // Every page must belong to the same snapshot. A change mid-walk means the server rebuilt it
    // underneath us, and stitching the halves together is where policies silently disappear.
    snapshotId ??= data.snapshot_id;
    if (data.snapshot_id !== snapshotId) throw new Error("snapshot changed mid-walk");

    expected ??= data.total_count;
    if (data.total_count !== expected) throw new Error("total_count changed mid-walk");
    policies.push(...data.policies);
    cursor = data.page?.next_cursor;
    complete = data.complete ?? false;
  } while (cursor);

  if (!complete) throw new Error("walk ended without a complete page");

  // DISTINCT ids, not array length. A cursor that emits one policy twice and skips another leaves the
  // length correct while a live policy is missing — and that missing policy is the one you would lapse.
  const distinct = new Set(policies.map((p) => p.policy_id)).size;
  if (distinct !== expected) throw new Error(`expected ${expected} policies, assembled ${distinct}`);
  return policies;   // only now is absence meaningful
}
```

### Python

```python
def pull_snapshot(client) -> list[Policy]:
    policies: list[Policy] = []
    snapshot_id: str | None = None
    cursor: str | None = None
    complete = False
    expected: int | None = None

    while True:
        page = client.list_policies(cursor=cursor, snapshot_id=snapshot_id, limit=250)

        if page.mode != "full":
            raise NotASnapshot("absence carries no meaning in an incremental response")

        if snapshot_id is None:
            snapshot_id = page.snapshot_id
            expected = page.total_count
        else:
            if page.snapshot_id != snapshot_id:
                raise SnapshotChanged("server rebuilt the snapshot mid-walk")
            if page.total_count != expected:
                raise SnapshotChanged("total_count changed mid-walk")

        policies.extend(page.policies)
        complete = page.complete
        cursor = page.page.next_cursor if page.page else None
        if not cursor:
            break

    if not complete:
        raise IncompleteSnapshot("walk ended without a complete page")

    # DISTINCT ids, not len(). A cursor that emits one policy twice and skips another leaves the
    # length correct while a live policy is missing — and that one is the one you would lapse.
    distinct = len({p.policy_id for p in policies})
    if distinct != expected:
        raise IncompleteSnapshot(f"expected {expected}, assembled {distinct}")
    return policies
```

The same shape applies in every language: accumulate, pin the `snapshot_id`, and refuse to return
anything unless the walk finished. Make the function that pulls the snapshot the *only* thing that
can hand policies to your reconciliation — then a partial walk is a thrown exception rather than a
quiet data loss.

## Reconciling, once you have a complete snapshot

```
for each policy in the snapshot:
    held?  -> update
    new?   -> insert
for each policy you hold that is NOT in the snapshot:
    within snapshot `coverage`?  -> mark no longer in force
    outside it?                  -> leave alone
```

That last line matters. Absence means "not in force" **only within the declared scope**. A snapshot
filtered to two adviser codes says nothing about a third, and a default snapshot excludes terminal
statuses — so a policy absent from it may simply never have been reported. Read `coverage` on the
response rather than assuming your request was honoured verbatim.

A belt-and-braces check worth adding regardless of what the contract guarantees: if a snapshot is
dramatically smaller than the last one, stop and alert rather than applying it. A complete,
consistent, correctly-walked snapshot can still be wrong at source — an insurer's own export job can
fail halfway and report success.

## Fields that may simply be absent

Insurer records differ in what they carry. `GET /capabilities` distinguishes "this policy has no
arrears" from "this insurer never reports arrears", which look identical in the data and mean very
different things:

Note `arrears` is an **array** — a policy can be behind on more than one instalment at once, and each
entry is identified by its own `dishonoured_on`. Sum the array for total exposure; do not assume one.

```jsonc
{
  "fields": {
    "arrears": true,
    "expected_lapse_date": false,   // arrears reported, but no lapse date — worklist can't be dated
    "commission_splits": false,
    "cover_type_mapping": true      // benefits carry cover_type, not just benefit_name
  }
}
```

Read it once, cache it, and let it drive what your UI claims. Rendering "no arrears" for an insurer
that never reports them is worse than rendering "not reported".
