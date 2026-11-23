# Worked examples

Every file here is a **literally valid payload**. Post one at the mock (`npm run mock`) with nothing
removed and it will be accepted:

```bash
curl -X POST http://127.0.0.1:4010/quotes \
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
- `policy.commission` is stated rather than left out. It could be omitted — the insurer would then
  price on its own default and report that as `defaulted` — but the premium differs by basis either
  way, so saying nothing means accepting a price set on a basis nobody chose.

### `commission-by-insurer-code.json`

**A remuneration arrangement the portable form cannot name**, requested by the insurer's own code.

`basis` plus `dial_down_percent` describes most of what advisers ask for, and it is what a consumer
should send. It does not reach everything a real schedule contains: upfront with no initial payment
and the full ongoing rate, upfront paid in the first year only, a level rate above the insurer's own
standard. Those are published options at insurers examined for this contract, and none of them is a
basis with a share given up.

- `insurer_commission_id` is the escape hatch, and the same shape of thing as
  `insurer_occupation_id`: the authoritative form, resolved from a list the insurer publishes. The
  ids live in `commission_bases[].options` in `GET /capabilities` — a ladder is five to fifteen rows,
  so it sits in the capability document rather than behind an endpoint of its own the way occupations
  do.
- An id the insurer does not publish MUST be **rejected**, not ignored. That obligation is written
  down because the failure was observed: an engine handed an unrecognised commission code — and,
  separately, another insurer's code — priced its own default both times and returned no error, 25%
  away from the intended premium.
- Whether an insurer accepts this form at all is declared in `commission_resolution`. `basis` is
  always accepted; the id is optional.

**Note what this example no longer does.** The insured is 62, and insurers commonly stop offering
upfront and hybrid commission on TPD above around this age while continuing to offer them on life
cover — so this policy will likely come back with its TPD benefit on a different basis. That is
reported by the insurer in `CoverLine.commission`, with a `substituted` entry in `resolved_options`.
It cannot be requested: an earlier draft let a consumer name a basis per cover, and the first
implementation showed why that was wrong — engines apply remuneration per policy or per product,
never per benefit, a product routinely spans several covers, and the one engine that could be forced
to override per product went on reporting the policy-level basis regardless. A field that invites a
line to be priced on one basis and reported on another is worse than its absence.

### `income-protection-90day-to-age-65.json`

Income protection alone, at the settings advisers reach for most often.

- `annual_income` is required on the insured, because the monthly benefit is capped as a proportion
  of it.
- **The benefit is 70% of income, rounded down**, and the digits matter. 70% of $185,000 is $129,500
  a year — $10,791.666… a month. This file sends `10791.66`. Half-up rounding would send
  `10791.67`, which annualises to $129,500.04: four cents above a 70% ceiling, declined, and the
  insurer disappears from the panel with nothing explaining why. Rounding to the nearest dollar is
  worse again. The wire carries dollars, so this arithmetic happens in the consumer where no schema
  can catch it — which is why the contract states the rule normatively.
- `superannuation_contribution` is an *additional* monthly amount, not part of `monthly_benefit`.
- `benefit_quality` and `replacement_ratio` are preferences over **this insurer's own** range, so
  both come back in `resolved_options`. They are not cross-insurer rankings.

### `income-protection-13week-wait.json`

The same benefit as above, from an insurer that publishes its deferral periods in **weeks**.

Set the two requests side by side, because the contrast is the point:

| | `income-protection-90day-to-age-65.json` | this one |
|---|---|---|
| `waiting_period` | `90d` | `13w` |
| Days before the benefit accrues | 90 | 91 |

**Those are different terms of contract, not the same one written two ways.** The industry says "90
day wait" and "13 week wait" interchangeably in conversation, and a claim admitted on the 91st day is
covered by one and not the other. So a consumer MUST NOT convert between the units to compare two
insurers, and MUST NOT show them as the same option — and an insurer asked for a value it does not
write either rejects it or reports a `substituted` entry, never both prices silently.

The other thing worth noticing is `monthly_benefit`. 70% of $142,000 over twelve months is
$8,283.33recurring, and it is rounded **down** to `8283.33`. Rounded half-up it would be `8283.34`,
which is a third of a cent above the insurer's ceiling — the benefit is declined, the insurer drops
off the panel, and nothing says why.

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
a present zero, which is exactly why the rule is stated in prose and has to be tested against an
implementation rather than a schema.

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

- In every frequency the four components sum **exactly** to `total`. An implementation should also
  test its totals against the insurer's own figures: a `total` built by adding the components meets
  this rule by construction, so it cannot catch a fee or a stamp duty left out of a component.
- `policy_fee` is already inside `total`. It is not a further addition, and it is reported separately
  only because it belongs to no single cover — which is why summing `cover_lines` will never reach
  the line total.
- The frequency loading is visible: weekly annualises to 2013.96 against an annual premium of
  1947.00. Dividing the annual figure by twelve would understate the monthly cost by about 3%, and
  nothing in the response would look wrong.

**And it says what it was priced on.** `commission` is required on any line carrying a premium, so a
consumer never has to infer the basis from the request — or, when comparing several insurers, guess
at it. The matching `resolved_options` entry answers the other question: not what was priced, but
whether it was what was asked for. An insurer that could only write `level` would report the same
line with `commission.basis` of `level` **and** a `substituted` entry saying so.

**Line 2 is the same insurer's other brand declining.** `all_needs_met` is `false`, `errors` says why
in terms an adviser can act on, and there is **no `premiums` object at all**. It must not be sorted
among the priced lines, must not be selectable, and must not be presented as a cheaper alternative.

It is returned rather than omitted for a specific reason: silently dropping it would be
indistinguishable from that brand not being on the panel, so the adviser would never learn it had
been asked.

Also note `resolved_occupation` differs between the two lines — different insurer occupation ids,
different wording, and **rating classes in entirely different notations** (`2`/`3` against `B`/`C`).
That is why rating classes must never be compared across insurers.

### `monthly-and-annual-only.json`

An insurer that bills monthly or yearly and nothing else. It answers
`income-protection-13week-wait.json`.

**`premiums` carries two frequencies, not six**, and the four it does not quote are named in
`not_quoted`:

```json
"premiums": {
  "monthly":  { "total": { "amount": "109.20", "currency": "AUD" }, "...": "..." },
  "annual":   { "total": { "amount": "1260.00", "currency": "AUD" }, "...": "..." },
  "not_quoted": ["weekly", "fortnightly", "quarterly", "half_yearly"]
}
```

This is what an earlier version of the standard could not express. It required all six frequencies,
so this insurer had two options: divide its annual premium by 52 and return the result, or fail
conformance. The first is the arithmetic the standard forbids the *consumer* from doing, made worse by
arriving with the authority of a quote — so the requirement was reduced to `monthly` and `annual`,
which are the two that are not substitutable for one another.

**`not_quoted` says why the four are missing, and it is not the authority on the fact that they
are.** `premiums` alone governs: a consumer MUST treat any absent frequency as unquoted whether or not
it appears in the list. Were the list authoritative, an implementation that forgot to populate it
would turn an absent premium back into an apparently derivable one — the exact failure the field
exists to prevent. What the list adds is the ability to tell a product fact from a bug, which is
otherwise unknowable from absence alone.

A frequency that appeared in both `premiums` and `not_quoted` is a contradiction, and the schema
rejects it — `PremiumSet` carries a `dependentSchemas` block for each of the four.

The frequency loading is still visible in what *is* quoted: monthly annualises to 1310.40 against an
annual premium of 1260.00, so dividing the annual figure by twelve would understate the monthly cost
by about 4%. That rule did not change. What changed is that an insurer is no longer required to break
it on the standard's behalf.

### `life-at-minimum-premium-with-features.json`

A small life cover that rates below the insurer's minimum premium, answering a request that set
`report_features`.

**`premiums` is the minimum, because that is what the client pays.** The cover rates at 486.16 a
year against a 500.00 minimum, so the line says 500.00. `minimum_premium` records that the floor
applied, at each frequency the insurer states one for, and the rated figure beside it. The rated
figure is there so an adviser can reconcile the two. Nobody is meant to quote it: it is a price the
insurer will not honour.

- The monthly minimum is the insurer's own (45.00), **not** the annual minimum over twelve. It is the
  frequency rule again.
- `cover_lines` still show the RATED 486.16. The uplift sits inside the line's `PremiumBreakdown`,
  which is where the arithmetic invariant is checked, and is one more reason summing cover lines does
  not reach the line total.

**`product_disclosures` names the edition**, not just the product, so the document this client was
shown can be identified later. No `effective_to` means the edition is current.

**`features` states facts, not an assessment.** Terminal illness is `included`, meaning it is in this
price. The disability premium waiver is `optional`, meaning it is available but NOT in this price.
Guarantee of upgrade is `not_offered`. A fourth status, `available`, is for a source that records
that a product HAS a feature without recording whether it is built in. Aggregated research data
often doesn't record this, because a PDS lists built-in benefits and extra-cost options side by
side. Any code missing from the array is unknown, which is not the same as "not offered". There are no scores, strengths or limitations, because the standard does not
carry opinions about a product.

## Occupations

Responses to `POST /occupations:match`. They show how an insurer says what to ask when one baseline
code lands on several of its rows. The ids, wording and classes are invented.

### `occupations/match-split-by-facts.json`

A painter, where the insurer has four rows and three facts decide between them.

- `occupation_groups[0].asks` is the whole question list: qualifications, years in the occupation and
  working height. Nothing else changes this insurer's answer, so nothing else is worth asking.
- Each candidate's `selected_when` says which answers pick it. A trade-qualified painter working at
  6 metres meets `PNT-10` and no other row.
- The bands (10 metres, 3 years) are this insurer's. They are published on its rows, not defined by
  the standard, and mean nothing at another insurer.
- `PNT-13` carries `insurer_default`. It is what this insurer rates when told "painter" and nothing
  more.
- `qualifications` is a list, so a row tests it with `includes` or `excludes`. "Unqualified" here
  is `excludes: [trade, licensed_or_registered]`, which an empty list meets and an unanswered
  question does not.
- An unqualified painter whose years in the occupation were not asked meets no row. The consumer
  does not guess: it quotes on the default row or sends the answers to `:match`.

### `occupations/match-split-by-specialty.json`

A security guard, where the insurer splits the occupation by specialty first.

- The group has `specialties` and no `asks` of its own. The adviser picks a specialty, and each
  specialty has its own questions: bank security asks about a firearm, event security asks nothing.
- `GRD-30` has no `selected_when` because it is the only row of its specialty.
- Rows name their specialty in `specialty_id`. `candidates` stays one flat list, so a consumer that
  ignores groups still reads every row.

### Quoting without asking

Nothing above has to be asked. A consumer that sends only the baseline code gets a price, and the
line says what was assumed:

```json
"resolved_occupation": {
  "insurer_occupation_id": "GRD-21",
  "description": "Security guard, bank security, armed",
  "specialty": { "id": "GRD-BANK", "name": "Bank security" },
  "specialty_defaulted": true,
  "defaulted_qualifiers": ["licensed_to_carry_firearm"],
  "match_confidence": "high",
  "ratings": { "life": { "supported": true, "rating_class": "4" }, "income_protection": { "supported": false } }
}
```

That is an indicative quote, and the two `defaulted` fields are how an adviser knows it. Answering
the questions and quoting again on the selected row firms it up.

A consumer that sends the `insurer_default` row's id instead also gets a price, but it named the
row, so `specialty_defaulted` is `false`: the insurer cannot tell a deliberate pick from a default
sent without asking. The consumer knows which it was, and tells the adviser itself.
