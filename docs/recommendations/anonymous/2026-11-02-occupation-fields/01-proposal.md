# Occupation fields: summary of the proposal

| | |
|---|---|
| Proposal | 2 November 2026, from an insurer implementing the standard |
| This document | A summary written by the maintainers. The proposer asked not to be named, so the original is not filed |
| Next | [`02-response.md`](02-response.md), then [`03-reply.md`](03-reply.md) |

The proposer's occupation wording, ids and band boundaries are left out. Sizes of the proposer's
own list are rounded. Shapes and field names are as proposed.

## The case

The proposer mapped OSCA 2024 onto its own occupation list (about 1,500 rated rows) and priced
every row. Of the 1,156 OSCA occupations:

| Match | Share of OSCA occupations |
|---|---|
| One insurer row | about a third |
| Several insurer rows | about half |
| No insurer row | about a sixth |

The mapping was made by matching titles and had not been reviewed by the proposer's underwriters.
Fewer than half of the matches were of high or medium confidence.

For an OSCA occupation that lands on several rows, the proposal measured how often the consumer
reaches one price:

| What the consumer sends | Reaches one price |
|---|---|
| The OSCA code alone | 5% |
| The code and the qualifiers in the standard at the time | 40% |
| The code and the fields proposed below | 84% |
| Those, and ten yes or no questions each asked by a few occupations | 86% |
| Those, and a specialty picked by the adviser (ask 1) | 100% |

## The asks, in the proposer's priority order

Every field is optional. An insurer that does not rate on one ignores it, and a consumer that does
not ask gets the insurer's default.

| # | Ask | Shape proposed | Difference the proposal measured |
|---|---|---|---|
| 1 | `:match` and `/occupations` say what each occupation needs: the qualifiers that change its rating, including any only that occupation asks, and the specialty options where the insurer splits it | occupation, then specialties (each with its questions), then rows | About 70% of the proposer's occupations need nothing asked. The last 14% of split OSCA occupations reach one price only through a specialty pick. They fall in about two dozen families, mostly retail, driving and mining, the largest with around seventy options. Ten occupation-specific yes or no questions settle a dozen more |
| 2 | `trade_qualified` becomes `qualification`, the highest qualification relevant to the occupation | none, trade, licensed or registered, professional body, relevant degree | Affects 273 OSCA occupations. Of those split by degree, the number reaching one price rises more than tenfold. Licensed, registered and professional-body roles get their own rating |
| 3 | Add `years_in_occupation`, also covering how long a business has run | number of years | Affects 68 OSCA occupations. A cover offered on some matching rows and declined on others falls from 19% of answers to 3% |
| 4 | Add `works_from_home` | yes or no | Affects 26. The same mismatch falls from 26% to 0% |
| 5 | `handles_explosives` becomes `hazardous_exposure` | one of none, explosives, chemicals, high voltage, dangerous goods | Affects 26. The gap between the cheapest and dearest matching rows falls from 24% to 10% |
| 6 | Add `makes_deliveries` and `driving_radius_km` | yes or no; number of kilometres | Affects 28. The cover mismatch falls from 30% to 18% |
| 7 | `ResolvedOccupation` lists the qualifiers rated at the insurer's default | list of qualifier names | An indicative quote says when it assumed an answer |
| 8 | Add `seasonal_work` | yes or no | Affects one OSCA occupation |

## The flow proposed

Two calls and one decision.

1. **Find out what the occupation needs.** The adviser picks an OSCA occupation. The consumer calls
   `:match` per insurer on the code. The insurer returns the occupation with its questions and its
   specialty options.
2. **Ask, if there is anything to ask.** The adviser picks the specialty and answers only the
   questions that specialty asks.
3. **Quote on the answers.** The consumer sends `insurer_occupation_id` with the answers. The
   insurer prices, and flags any answer it rated at its default (ask 7).

Step 1 gives the same answer for every client in an occupation, so a consumer can cache
`/occupations` and not call `:match` per quote. A consumer that skips step 1 and quotes on the OSCA
code alone still gets a price: the insurer rates on its most restrictive row and lists the
qualifiers it assumed.

## The shapes proposed

Ask 1 changes the shape of the occupation responses. Everything else adds optional fields.

| Change | On | Ask |
|---|---|---|
| `occupations`: the occupation, then its specialties, then the candidate rows, replacing the flat `candidates` list | `OccupationMatchResponse`; `OccupationListResponse`, paged by occupation | 1 |
| `asks`: the qualifiers that change the rating | each specialty | 1 |
| `selected_when`: the answers that pick this row | `OccupationCandidate`, `InsurerOccupation` | 1 |
| `qualification`, `years_in_occupation`, `works_from_home`, `hazardous_exposure`, `makes_deliveries`, `driving_radius_km`, `seasonal_work` | `OccupationQualifiers` | 2 to 6, 8 |
| `defaulted_qualifiers` | `ResolvedOccupation` | 7 |

**Preferred: nested.** Rows sit under specialties, and specialties under occupations. The
identifiers below are placeholders.

```json
{
  "occupations": [
    {
      "id": "…",
      "description": "…",
      "specialties": [
        {
          "name": "…",
          "asks": ["licensed_to_carry_firearm"],
          "candidates": [
            {
              "insurer_occupation_id": "…",
              "description": "…",
              "selected_when": { "licensed_to_carry_firearm": { "equals": true } },
              "ratings": { "…": "…" },
              "match_confidence": "high"
            }
          ]
        }
      ]
    }
  ]
}
```

- **The questions sit on the specialty, not the occupation**, because specialties of one occupation
  ask different things. The proposal's example is a security occupation where one specialty asks
  about firearms and another asks nothing.
- **An occupation not split by specialty** has one specialty with no `name`.
- **A specialty with no `asks`** has one row.
- **`selected_when` is a map from qualifier name to a condition:** `in` for a choice; `gt`, `gte`,
  `lt`, `lte` for a number; `equals` for yes or no. Conditions on different qualifiers all apply.
  An `any_of` key holds alternatives, for a rule such as "a relevant degree, or income above a
  threshold".

**Fallback: flat.** Offered in case a new response shape was too large a change. `candidates` stays
a flat list. Each candidate gains `occupation_id`, `specialty` and `selected_when`, and a sibling
`occupations` array states each specialty's `asks` once. Consumers that read only `candidates` keep
working. `/occupations` rows carry the same three fields, with the `occupations` array on each
page.

The proposal names the cost of the fallback: a consumer has to join the two lists itself, and the
response is no longer one closed object per row.
