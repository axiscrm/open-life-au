# Policy contract — not started

In-force policy data, status changes and premium dishonours. Placeholder so the release train and
directory exist; no schemas yet.

## Why this contract is planned

Adviser software currently obtains this data by scraping insurer portals and parsing whatever file
format each insurer happens to produce. That is fragile on the consumer's side and a support burden
on the insurer's — a portal change breaks the consumer, and the insurer hears about it.

Unlike quoting, this asks an insurer to *replace* something it already does rather than build
something new, and it is back-office operations rather than distribution or pricing. It may well be
the easier of the two conversations.

## Expected shape

Two protocols, because the data has two access patterns:

- **OpenAPI** for reconciliation — a delta-sync endpoint (`changed since`) and a full-snapshot
  endpoint, so a consumer can both keep current and periodically re-baseline.
- **AsyncAPI** for events — policy status changed, lapsed, renewed, premium dishonoured. These are
  genuinely events rather than things to poll for, and the value of a dishonour notification decays
  by the hour.

`core/schemas/` is deliberately pure JSON Schema 2020-12 rather than OpenAPI-flavoured, so the same
money, identifier, party and problem schemas back both.

## What must not diverge

A policy record refers to insurer, brand, product, covers, ownership, structure, premium frequency,
stamp duty and policy fees. Every one of those is already defined in `core/` for quoting, and every
one must mean the same thing here — reconciling a policy against the quote that produced it is one
of the main things this contract is for. Extend `core/`; do not redefine locally.
