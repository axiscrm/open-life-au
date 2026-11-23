# Occupation fields: response to the proposal

| | |
|---|---|
| Proposal | [`01-proposal.md`](01-proposal.md), 2 November 2026, from an insurer that asked not to be named |
| Response | 12 November 2026, Axis |
| Status | Reviewed by the proposer. See [`03-reply.md`](03-reply.md), which changes Ask 2 and closes the questions below |
| Contract changes | `core` and `quoting`, described in [`docs/migration/quoting-0.3.md`](../../../migration/quoting-0.3.md) |

## Summary

The proposal is adopted in substance. The proposer mapped OSCA onto its own list and measured how often a
baseline code reaches one price: 5% on the code alone, 40% with the existing qualifiers, 84% with
the proposed fields and 100% with a specialty pick. That is the evidence the occupation design has
been missing, and it comes from the only kind of party that can produce it.

Five things differ from what was proposed:

1. The response keeps flat rows and adds the grouping beside them (the proposal's fallback shape),
   and does not replace `candidates` with a nested tree.
2. The path where the adviser picks nothing is specified in full, because it has to keep working.
3. Three fields are shaped differently: `hazardous_exposures` is a list, years in business is
   split from years in the occupation, and `seasonal_work` is deferred.
4. `selected_when` is a list of conditions, so that generated clients can type it.
5. The ten occupation-specific questions are not in yet. They need a decision first.

## The asks

| # | Ask | Decision | In the contract as |
|---|---|---|---|
| 1 | What each occupation needs: specialties and questions | Adopted, in the flat shape | `occupation_groups`, and `occupation_group_id`, `specialty_id`, `selected_when`, `insurer_default` on each row |
| 2 | `trade_qualified` becomes `qualification` | Adopted | `qualification`; `trade_qualified` removed |
| 3 | `years_in_occupation`, also covering time in business | Adopted, split in two | `years_in_occupation`, `years_in_business` |
| 4 | `works_from_home` | Adopted, with a definition | `works_from_home` |
| 5 | `handles_explosives` becomes `hazardous_exposure` | Adopted, as a list | `hazardous_exposures`; `handles_explosives` removed |
| 6 | `makes_deliveries`, `driving_radius_km` | Adopted | as proposed |
| 7 | Say which qualifiers were rated at default | Adopted, extended to the specialty | `defaulted_qualifiers`, `specialty`, `specialty_defaulted` on `ResolvedOccupation` |
| 8 | `seasonal_work` | Deferred | not added |

## Reasoning

### Ask 1: flat rows with groups beside them

The proposal's preferred shape nests rows under specialties under occupations, replacing
`candidates`. Its fallback keeps `candidates` flat and adds a sibling array. This response takes
the fallback, for three reasons.

**A consumer must be able to ask nothing.** Not every consumer can put a specialty question in
front of an adviser, and not every route to an insurer can carry the answer. A panel comparison
that reaches some insurers directly and others through an intermediary needs one behaviour that
works for all of them: read the rows, quote on the insurer's default. With flat rows that consumer
reads one list and ignores the rest. With a nested tree every consumer has to walk the tree to
find any row at all.

**`/occupations` already pages by row.** The list runs to well over a thousand rows and is
pre-loaded with a cursor. Rows are a stable unit to page. A nested occupation with seventy
specialties is not.

**The name was taken.** `OccupationListResponse.occupations` is already the flat list of rows, so
the grouping could not be called `occupations` in either shape. It is `occupation_groups`.

The proposal names the cost of the flat shape: the consumer joins two lists. That is a join on one
id, done once per insurer when the list is cached.

Other changes to the proposed shape:

- **Specialties have an `id`.** The proposal keyed them by `name`. Names are display wording and
  get reworded.
- **An unsplit occupation has no specialty.** The proposal gave it one specialty with no name. Here
  a group carries either `specialties` or its own `asks`, never both, and the schema enforces it.
- **`max_candidates` cannot split a group.** It defaults to 10 and the proposal cites an occupation
  with around seventy specialty options. A truncated group would hide specialties with nothing to say so.
- **`selected_when` is a list of conditions, not a map.** The proposal keyed conditions by
  qualifier name, with `any_of` as one more key holding a different type. The Rust generator this
  repository checks against emits no type for that and the generated crate does not compile.
  Each condition now names its fact in `input`, as in
  `{ "input": "working_height_m", "lte": 10 }`, under `conditions`. It says the same thing and
  every generator types it.
- **`selected_when` has two more operators.** `includes` and `excludes`, for the list-valued
  `hazardous_exposures`. `annual_income` is a valid key, since the proposal's own example of
  `any_of` turns on income, which is not a qualifier.

### The path where nothing is asked

The proposal covers this in one paragraph: the insurer rates on its most restrictive row and lists
the assumed qualifiers. It needed more, because for some consumers it is the main path.

- **The insurer declares its default row**, with `insurer_default: true`. "Most restrictive" does
  not pick one row when a row is worst for income protection and another is worst for life. The
  only rule the standard sets is that the default is not chosen for being cheapest.
- **The default is visible before quoting.** It is on the row in `:match` and `/occupations`, so a
  consumer can tell the adviser what will be assumed.
- **It works without OSCA.** A consumer of an insurer that accepts only `insurer_occupation_id`
  sends the default row's id.
- **The quote reports the specialty too.** `defaulted_qualifiers` could not say "the specialty was
  assumed", so `ResolvedOccupation` gains `specialty` and `specialty_defaulted`.

### Ask 1, continued: where the id and the answers disagree

Step 2 of the proposed flow sends `insurer_occupation_id` with the qualifiers. The contract already
says an id is rated exactly and never re-matched. That stands: the id wins, and an insurer that
sees qualifiers contradicting the row's `selected_when` rates on the row and should say so in
`warnings`. An adviser correcting a row by hand is the reason the id form exists.

### Ask 2: `qualification`

Adopted as proposed. The values are `none`, `trade`, `licensed_or_registered`, `professional_body`
and `relevant_degree`. The proposal's table and its example disagree on the second (`trade` in one,
`trade_qualified` in the other); `trade` is used.

"Highest" needs an order to mean anything, so the order is stated: the values are listed lowest to
highest, and an insured holding several sends the last. **This order is a guess and needs
confirming** (see the questions below).

`trade_qualified` is removed, not deprecated. The change is breaking either way, and two fields for
one fact need a precedence rule that is one more place to mis-rate.

### Ask 3: years in the occupation, and in business

The proposal has one field covering both. They are different facts with different answers for the
same person: a tradesperson of twenty years who opened a business last year. An insurer asking
about a new business would read "20" and be wrong. Two fields, both optional.

### Ask 4: `works_from_home`

Adopted, defined as the principal place of work (more than half of working time). Without that,
an employee with two days a week at home has no right answer.

### Ask 5: `hazardous_exposures`

The proposal has one value from `none`, `explosives`, `chemicals`, `high_voltage`,
`dangerous_goods`. The exposures are not alternatives, so it is a list. An empty list says "none",
which keeps the difference between "no exposure" and "not stated" that every qualifier relies on.

### Ask 8: `seasonal_work`

Deferred. The proposal counts one OSCA occupation and two rows. A fact that splits one occupation
at one insurer is what a specialty is for, and it can be published that way today. If a second
insurer rates on it, it earns a field.

### Not yet in: occupation-specific questions

Ask 1 includes questions only one occupation asks, and the proposal counts ten yes or no questions
(flying, lifting, using a motorbike) that settle twelve more occupations. They are not in this
change, because `OccupationQualifiers` is closed and there are two ways to open it:

- **Promote them to standard qualifiers.** Right for a fact more than one insurer would rate on.
  "Uses a motorbike for work" probably is one.
- **Add an insurer-scoped answers map**, with the question wording published in the group. Right
  for a fact that is one insurer's alone.

Which applies depends on the ten questions, so the list is needed first.

## Questions for the proposer

1. **Is the flat shape workable?** It carries everything the nested shape does. If the join is a
   real cost on your side, say where.
2. **What are the ten occupation-specific questions?** With the list we can decide which become
   standard qualifiers.
3. **How do you choose the default row** when the specialty and the questions are unanswered, and
   can you mark it per group?
4. **Is the order of `qualification` right?** In particular, whether a relevant degree sits above
   membership of a professional body, and whether one value is enough or you need everything held.
5. **Does splitting `years_in_business` from `years_in_occupation` lose anything** you were relying
   on the single field for?
6. **Are your rows within a specialty mutually exclusive?** The contract says a consumer whose
   answers meet several rows must not choose. If overlap is normal in your list, we need a
   tie-break.

## What this response does not carry across

The proposal's examples use the proposer's occupation wording and band boundaries. The examples in the
contract (`domains/quoting/examples/occupations/`) are invented, and the bands in them are
illustrative. An insurer's bands belong on its own rows, published by it through `selected_when`.
