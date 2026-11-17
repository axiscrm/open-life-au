# Quoting 0.2 → 0.3

One change, to occupations: an insurer can now say what to ask when a baseline code lands on
several of its rows, and a quote says what it assumed when nothing was asked. Two qualifiers are
replaced, which is the breaking part. `core` moves with it, because the occupation reference lives
there.

The proposal this came from, and the reasoning for each decision, are in
[`docs/recommendations/`](../recommendations/README.md).

## Removed: `trade_qualified` and `handles_explosives`

Both were yes or no, and both lost information insurers rate on.

| Removed | Send instead |
|---|---|
| `trade_qualified: true` | `qualifications: [trade]`, with `licensed_or_registered`, `professional_body` and `relevant_degree` added where held |
| `trade_qualified: false` | `qualifications: []` |
| `handles_explosives: true` | `hazardous_exposures: [explosives]` |
| `handles_explosives: false` | `hazardous_exposures: []` |

`qualifications` is a list of everything held, with no order: some occupations are rated on
holding two at once, such as a licence and a trade qualification. An empty list says none is held.
Leaving the field out says it was not asked.

**Removed without a deprecation period**, as `research_scores` was in 0.2 and for the same reason:
the twelve-month rule in `VERSIONING.md` is for 1.0 and after. Carrying both forms would also need
a precedence rule for a request that sends both, and that is one more place to mis-rate.

**What to do.**

- *Consumers:* send the new fields. The old ones are now rejected by the schema
  (`additionalProperties: false`), so a consumer that keeps sending them gets a 422 and no quote.
- *Implementations:* map the new fields onto your own bands. Reject the old ones. Do not accept
  and ignore them: a trade-qualified insured would then price at your unqualified default.

## Added qualifiers (not breaking)

`years_in_occupation`, `years_in_business`, `works_from_home`, `makes_deliveries` and
`driving_radius_km`. Each is optional, as every qualifier is. An insurer that does not rate on one
ignores it. What each means is in `taxonomy/occupation-qualifiers.yaml`.

## Added: occupation groups (not breaking)

`POST /occupations:match` and `GET /occupations` still return flat rows. Beside them is an
optional `occupation_groups` array, and each row gains four optional fields.

| Field | On | Says |
|---|---|---|
| `occupation_groups[]` | both responses | one insurer occupation: its `specialties`, or its `asks` where it has none |
| `occupation_group_id`, `specialty_id` | each row | which group and specialty the row belongs to |
| `selected_when` | each row | the answers that pick this row |
| `insurer_default` | each row | the row rated when nothing is asked |

- *Consumers that ask nothing:* no change. Read `candidates` as before.
- *Consumers that want one price:* ask for the specialty where the group has them, then the facts
  in `asks`, then take the row whose `selected_when` the answers meet. Where they meet no row or
  several, quote on the default row or send the answers to `:match`. Never choose a row yourself.
- *Implementations:* publishing groups is optional. If you do, a group is returned whole:
  `max_candidates` does not split one. On a paged `GET /occupations`, every page carries, whole,
  each group one of its rows belongs to, so a group whose rows span pages is repeated. Publish
  `selected_when` conditions that do not overlap within a group or specialty.

## Added: what a quote assumed (not breaking)

`ResolvedOccupation` gains `specialty`, `specialty_defaulted` and `defaulted_qualifiers`. A quote
on a baseline code alone still prices. It now names the specialty it was rated on and lists the
facts it took at the insurer's default, so an indicative quote can be told from a firm one.

*Implementations:* list in `defaulted_qualifiers` every fact the rated row turns on that the
request did not state. Leave it empty when nothing was assumed.

## Clarified: `insurer_occupation_id` sent with `qualifiers`

The id still wins and the insurer still MUST NOT re-match. Where the qualifiers contradict the
row's `selected_when`, the insurer rates on the row and SHOULD say so in `warnings`.

## Tightened: `occupation_qualifiers_used`

The capability's items were free strings and are now `OccupationRatingInput` names. A document
listing `trade_qualified` or `handles_explosives` should list `qualifications` or
`hazardous_exposures`.
