# Provenance rules

One rule outranks convenience everywhere in this repository.

> **Nothing in this standard may be derived from a third-party aggregator's specification.**
> It is modelled on the questions an adviser answers, and its occupation baseline comes from the
> Australian Bureau of Statistics.

This is enforced by `scripts/check-provenance.mjs`, which runs in CI.

## Why

**Licensing.** Aggregator API specifications are licensed documents. Copying field names, enum
values, code tables or wording out of one and into a public repository puts that material into the
open under our name. Note that the mapping tables inside an existing integration adapter are the
most tempting shortcut in the whole project — they are exactly the accumulated knowledge you want —
and they are exactly the material that must not travel.

**Independence.** A standard whose shape is traced from one vendor's wire format re-imports the
dependency it exists to remove. Every implementer would inherit that vendor's modelling
compromises, and the standard could never outlive it.

**A claim we have to be able to defend.** The occupation baseline is ABS-derived. That has to be
demonstrable from the repository's history, not merely asserted, because it is the answer to
"whose taxonomy is this, and who maintains it?" — the first question any insurer's architect will
ask about the occupation design.

## The distinction to hold

Working out *which concepts matter* by looking at an existing integration is legitimate and
expected. That is domain research.

Carrying across *a name, string, code, structure or wording* is not.

Two worked examples:

| Legitimate | Not legitimate |
|---|---|
| Noticing that insurers rate a painter differently depending on the height they work at, and therefore defining a `working_height_m` qualifier | Copying an aggregator's occupation description string, such as its particular phrasing of a height band |
| Observing that waiting periods in this market cluster at a handful of durations, and defining a `WaitingPeriod` enum from the adviser-facing labels | Copying an aggregator's internal codes for those durations, or its enum ordering |
| Learning that a TPD extension's buy-back options differ from a trauma extension's, and modelling the two enums separately | Reproducing an aggregator's letter codes for those options |

## What the CI gate checks

`scripts/check-provenance.mjs` fails the build on any occurrence of an aggregator's name, an
insurer-specific name, or the `§` section-citation style, anywhere under `core/`, `domains/`,
`taxonomy/`, `dist/`, `postman/`, `reference-impl/` or `docs/`.

The section symbol is in the list deliberately. A `§7.45`-style citation is a reliable fingerprint
of text lifted from a vendor specification, and it is the thing most likely to survive a
copy-paste unnoticed.

The gate makes no exception for legitimate citations of public standards, and that is on purpose.
Write "RFC 6749, section 4.4" rather than "RFC 6749 §4.4". A strict rule with an easy compliant
alternative is worth more than a clever rule with a bypass in it — the moment the gate learns to
recognise "acceptable" uses of `§`, it stops being a reliable signal.

A short allowlist covers the files whose subject genuinely *is* the relationship to an aggregator
or a specific insurer — currently the ACORD relationship note and the gap analysis. Every entry on
that list is a place a reviewer has to read by hand, so keep it short.

## If the gate fires

Do not add an allowlist entry to make it pass. Rewrite the material from the adviser-facing
concept instead. If you genuinely cannot express something without reference to a vendor's
vocabulary, that is a signal the concept has not been understood well enough to standardise yet —
raise it rather than routing around it.
