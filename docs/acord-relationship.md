# Relationship to ACORD

**Short answer:** this standard is not an ACORD standard and does not profile one. It occupies a gap
ACORD does not currently cover — Australian life *risk* quoting at the point of advice — and where a
concept exists in both, we have tried not to gratuitously disagree.

This note exists because "why aren't you using ACORD?" is a fair question and will be asked in
architecture reviews we are not in the room for. It deserves a written answer rather than an
improvised one.

## What ACORD is

ACORD is the global insurance data standards body. Its **Next-Generation Digital Standards** (NGDS),
released in August 2025, are explicitly REST- and OpenAPI-oriented and span property and casualty,
life and annuity, reinsurance and adjacent lines — a substantial modernisation of standards whose
lineage runs back through ACORD's XML messages.

If you are building carrier-to-carrier, reinsurance or policy-administration integrations,
particularly across multiple markets, ACORD is very likely the right answer and this standard is not.

## Why we did not build on it here

**Access.** NGDS is membership-gated. A standard intended to be implemented by insurers and read by
anyone cannot have a paywall between a developer and the schema they are being asked to implement.
Publishing a derivative would also raise licensing questions we would need to resolve before
distributing anything.

**Scope.** ACORD's life and annuity work centres on policy administration, new business and
in-force servicing. The thing we need is narrower and further upstream: comparative *quoting* at the
point of advice, across a panel of insurers, in a single market. There is no NGDS profile for it, so
adopting ACORD would mean authoring that profile — the same design work, with less freedom and a
narrower audience.

**Market specificity.** The hard parts of this contract are Australian: stamp duty levied per
state and split by superannuation ownership; the superannuation/ordinary/SMSF ownership forms and
the linked structures over them; occupation rating against an ABS classification. These are not
international concepts, and a global standard should not be expected to carry them.

**Weight.** ACORD-aligned specifications tend toward hundreds of operations and deeply nested,
polymorphic schemas, because they serve many markets and many use cases. This contract is four
operations, and that is the point: an insurer's team should be able to read the whole thing in an
afternoon and estimate the work honestly.

## Where we have deliberately aligned

- **Vocabulary.** Where ACORD and Australian market usage agree on what a thing is called, we use
  that name rather than inventing one.
- **Separation of party, cover and product.** Kept as distinct concepts rather than flattened,
  which is both ACORD's approach and simply correct.
- **REST and OpenAPI over a bespoke transport.** The same technology choice NGDS made, for the same
  reason: it is what insurer platform teams can already deploy and secure.

## If ACORD later covers this ground

That would be a good outcome, and the migration path is deliberately short: `core/` is pure JSON
Schema 2020-12, the contracts are thin over it, and every consumer of this standard sits behind an
adapter layer regardless. Mapping `core/` onto an ACORD profile would be a bounded piece of work, not
a rewrite.

## Open item

The NGDS licensing terms for public derivative works have **not** been verified. If this standard is
ever to reference NGDS schemas directly — as opposed to merely being compared with them, as here —
that needs a legal answer first.
