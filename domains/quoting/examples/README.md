# Worked examples

Every file here is a **literally valid payload**. Post one at the mock (`npm run mock`) with nothing
removed and it will be accepted:

```bash
curl -X POST http://localhost:4010/quotes \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer test' \
  --data @requests/life-with-linked-tpd-in-super.json
```

That property is enforced, not merely intended. `npm run examples` validates these files exactly as
committed, and the request schemas are closed — so an annotation added "just for the reader" would
fail the build. The commentary lives in this file precisely so the payloads stay copy-pasteable,
because the first thing anyone evaluating this contract does is copy an example.

`npm run examples` also checks the response example against the arithmetic invariants the contract
states in prose but JSON Schema cannot express. A worked example that violated one would teach the
wrong thing more effectively than any documentation could correct.

## Requests

### `life-with-linked-tpd-in-super.json`

The commonest structure an adviser writes: life cover held inside superannuation, with a TPD
extension linked to it and held personally so its premium is not funded from super.

Worth noticing:

- The TPD cover **overrides** `ownership` while **inheriting** `structure` from `policy` — that
  inheritance is why policy-level answers exist rather than being repeated per cover.
- `linked_to` plus `link_type` is what makes this an extension rather than a standalone TPD. It is a
  flat reference, not nesting, so the request and the response have the same shape.
- `life_buyback` and `double_benefit` are only meaningful *because* this is an extension — both
  describe what happens to the parent life cover when the TPD benefit is paid.
- `pay_by_rollover` is `prefer`, a deferred choice. The insurer decides and must report what it did.

### `income-protection-90day-to-age-65.json`

Income protection alone, at the settings advisers reach for most often.

- `annual_income` is required on the insured, because the monthly benefit is capped as a proportion
  of it.
- `superannuation_contribution` is an *additional* monthly amount, not part of `monthly_benefit`.
- `benefit_quality` and `replacement_ratio` are preferences over **this insurer's own** range, so
  both come back in `resolved_options`. They are not cross-insurer rankings.

### `loadings-with-explicit-zero.json`

The sparse-map case, and the reason the loadings semantics are stated normatively in prose rather
than left to the schema.

This adviser is saying three different things at once:

| Benefit | Instruction |
|---|---|
| Life | loaded 50% **and** $1.50 per thousand — both axes apply together |
| Trauma | an **explicit** nil loading, stated positively |
| TPD | nothing said at all, so no loading is inherited |

An implementation that "tidies" the trauma zero into an omission, or rejects it as pointless, has
silently changed the instruction. JSON Schema cannot express the difference between an absent key and
a present zero, which is exactly why the conformance suite tests it.

### `child-trauma-and-minimal-life.json`

Two things at once.

The **smallest valid request**: no `policy` block at all, so every default applies. Useful as a
starting point when implementing.

And **child trauma**, the one cover with no cover-level `sum_insured` — the amount is per child, so
each child names their own. Children are rated on age and gender alone, which is why `InsuredChild`
collects nothing else.

## Responses

### `life-priced-plus-declined-line.json`

One request, two lines — the shape consumers most often get wrong.

**Line 1 is a real offer.** Check the arithmetic:

- In every frequency the four components sum **exactly** to `total`.
- `policy_fee` is already inside `total`. It is not a further addition, and it is reported separately
  only because it belongs to no single cover — which is why summing `cover_lines` will never reach
  the line total.
- The frequency loading is visible: weekly annualises to 1238.12 against an annual premium of
  1197.00. Dividing the annual figure by twelve would understate the monthly cost by about 3%, and
  nothing in the response would look wrong.

**Line 2 is the same insurer's other brand declining.** `all_needs_met` is `false`, `errors` says why
in terms an adviser can act on, and there is **no `premiums` object at all**. It must not be sorted
among the priced lines, must not be selectable, and must not be presented as a cheaper alternative.

It is returned rather than omitted for a specific reason: silently dropping it would be
indistinguishable from that brand not being on the panel, so the adviser would never learn it had
been asked.

Also note `resolved_occupation` differs between the two lines — different insurer occupation ids,
different wording, and **rating classes in entirely different notations** (`2`/`3` against `B`/`C`).
That is why rating classes must never be compared across insurers.
