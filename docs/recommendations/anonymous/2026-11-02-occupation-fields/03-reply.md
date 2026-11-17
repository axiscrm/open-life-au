# Occupation fields: the proposer's reply to the response

| | |
|---|---|
| Proposal | [`01-proposal.md`](01-proposal.md), 2 November 2026 |
| Response | [`02-response.md`](02-response.md), 12 November 2026, Axis |
| Reply | 16 November 2026, from the proposer |
| This document | The reply with the proposer's name, occupation wording and list sizes removed. The last section is the maintainers' |

## Summary

The proposer accepts the response, flat shape included, with one change: **`qualification` becomes
`qualifications`, a list of everything held**, so no order is needed.

The proposer will publish all ten occupation-specific questions as specialties. Neither new
standard qualifiers nor the insurer-scoped answers map is needed for this insurer.

Figures are from the proposer's list as read on the day of the reply. It has slightly fewer
occupations than the proposal counted, because duplicate names were merged. About 30% of them have
more than one row.

## Answers

### 1. Is the flat shape workable?

Yes. The join is one id lookup on a cached list.

One question back: how does a paged `/occupations` carry `occupation_groups`? The proposer would
put each page's groups on that page, or allow a group to be fetched by id.

### 2. What are the ten occupation-specific questions?

| Question | Kinds of occupation that ask it |
|---|---|
| Rides a motorbike for work | Postal delivery |
| Flies for work | Photography, camera work, aircraft engineering |
| Studio only, or on location | Film production, photography |
| Is a manager | Catering, fitness, human resources, mining, warehousing |
| Driver or non-driver | Mining, waste removal |
| Lifting | Department store retail |
| Fitting | Battery retail |
| Confronts intruders | Security monitoring |
| Lives on the premises | Caretaking, property management |
| Works with livestock | Auctioneering, valuation |

Most appear on one side only: there is a row for one answer and no row for the opposite, so they
already behave as specialties. Each belongs to three occupations or fewer, apart from the film
roles and "manager", which are specialties by nature. By the response's reasoning for
`seasonal_work`, the proposer will publish all ten as specialties. If a second insurer rates on
one, it earns a field then.

### 3. How do you choose the default row, and can you mark it per group?

Yes, per group. The proposed rule is the row that declines the most covers, then the one with the
highest premium for a standard client. It is never the cheapest, and it gives one row where life
and income protection would otherwise disagree. The proposer will confirm the rule before
publishing.

### 4. Is the order of `qualification` right?

It works for the proposer: none of its rows compares a degree with membership of a professional
body. But two of its rows need two qualifications at once:

- a building trade that must be both licensed and fully trade qualified
- a complementary health practitioner who must be both qualified and registered

With a single value these hold only if the licence implies the trade qualification, which is an
assumption another insurer's list may not share. A list avoids it, for the reason the response made
`hazardous_exposures` a list. An empty list says "none held", so the `none` value goes.

### 5. Does splitting `years_in_business` from `years_in_occupation` lose anything?

No, it improves on the proposal. Of the rows that turn on either, about one in ten uses the age of
the business and the rest use years in the occupation. One row needs both: an occupation that must
be well established and have a minimum number of years of experience.

### 6. Are your rows within a specialty mutually exclusive?

Not yet. In about one in nine of the occupations with more than one row, one set of answers meets
more than one row. Two kinds are common:

- **Nested bands:** a row for field work under a lower percentage beside a row for field work under
  a higher one.
- **Rows on different facts:** a row for "trade qualified, or a minimum number of years of
  experience" beside a row for "unqualified, or fewer years than that".

No tie-break is needed in the contract. Keep the rule that a consumer must not choose. The proposer
will publish exclusive conditions in `selected_when`.

## Changes asked for in the contract

| Change | Section of the response |
|---|---|
| `qualification` becomes `qualifications`, a list | Ask 2 |
| Say how a paged `/occupations` carries `occupation_groups` | Ask 1 |

## Outcome (added by the maintainers)

| Point in the reply | Outcome | In the contract as |
|---|---|---|
| `qualifications` as a list | Adopted | `qualifications`, with no `none` value and no order. `selected_when` tests it with `includes` and `excludes` |
| Paged `/occupations` and `occupation_groups` | Adopted, the first of the two options | Each page carries, whole, every group one of its rows belongs to. No fetch of a group by id |
| Ten occupation-specific questions | Closed for now | No change. They are published as specialties, so `OccupationQualifiers` stays closed. The two ways to open it remain on record in the response |
| Default row rule | Noted | No change. The rule is the insurer's. The standard still requires only that the default is not chosen for being cheapest |
| Overlapping rows | Adopted as guidance | An insurer SHOULD publish conditions that are exclusive within a group or specialty. The consumer rule is unchanged |
| Years in business | Confirmed | No change |
