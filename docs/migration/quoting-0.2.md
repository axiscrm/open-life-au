# Quoting 0.1 → 0.2

One removal and three additions. Only the removal is breaking.

## Removed: `research_scores`

`QuoteLine.research_scores`, the `ResearchScores` and `Score` schemas, and the
`features.research_scores` capability flag are gone.

**Why.** A research score is an opinion about a product, formed and maintained by whoever publishes
it. It is not something an insurer states about its own product, and this standard carries only
what the insurer states. Keeping it would oblige every consumer to handle a field whose values are
only comparable within one provider's dataset, and invite implementations to populate it from
sources the standard cannot hold to account. The same reasoning excludes strengths, limitations and
commentary, which were never in the standard and now will not be.

**Removed without a deprecation period.** `VERSIONING.md` asks for twelve months between
deprecating and removing, and that rule is for 1.0 and after. At 0.1 no implementation emitted the
field (the one that declared it never populated it) and no consumer displayed it.

**What to do.**

- *Implementations:* stop emitting `research_scores` and stop declaring the capability flag. Both are
  now rejected by the schema (`additionalProperties: false`).
- *Consumers:* nothing, unless you read the field. If you did, the scores must now come from their
  provider directly, attributed to it.

## Added (not breaking)

- **`QuoteLine.minimum_premium`** and capability **`features.minimum_premium`.** `premiums` is, and
  always was meant to be, what the client pays. Where the insurer's minimum premium is above what
  the cover rates at, `premiums` now MUST carry the minimum, and `minimum_premium` reports that it
  applied and the rated figure beside it. *An implementation whose upstream reports premiums
  before the minimum is applied must floor them.*
- **`QuoteLine.product_disclosures`.** Which PDS edition, including any supplementary PDS, each
  product on the line is written under. Recommended on every line.
- **`QuoteRequest.report_features`**, **`QuoteLine.features`** and capability
  **`features.feature_reporting`.** On request, each line reports what it offers against the
  standard feature vocabulary: `included` (in this price), `optional` (available, not in this
  price), `available` (offered, but the source does not say whether it is in this price) or
  `not_offered`, with the insurer's own wording. A code missing from the report means
  unknown, not "not offered".
