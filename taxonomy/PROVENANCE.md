# Occupation baseline — provenance

The occupation baseline in this standard is the Australian Bureau of Statistics' **Occupation
Standard Classification for Australia (OSCA)**. This file records where it came from, so the claim
is auditable rather than asserted. See also [`../docs/PROVENANCE-RULES.md`](../docs/PROVENANCE-RULES.md).

## Source

| | |
|---|---|
| Classification | Occupation Standard Classification for Australia (OSCA) |
| Publisher | Australian Bureau of Statistics |
| Edition | OSCA 2024, Version 1.0 |
| Released | 6 December 2024 |
| Licence | Creative Commons Attribution (ABS standard terms) |
| Landing page | <https://abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/latest-release> |

OSCA **replaced** ANZSCO, which the ABS and Stats NZ had maintained jointly since 2006. The two
agencies separated their classifications to reflect the differences between the Australian and New
Zealand labour markets; New Zealand's successor is the National Occupation List.

OSCA v1.0 added roughly 300 occupations and removed roughly 250 relative to ANZSCO.

## Why the ABS, and not us

Whoever defines the baseline maintains it forever and carries the blame when a mis-mapping produces
a plausible but wrong premium. Neither an adviser-software vendor nor an aggregator should hold that
position, because both are commercially interested parties in the quotes that depend on it.

The ABS already maintains this classification for its own purposes, publishes it openly, and has no
stake in any quote. That makes it the only sensible custodian.

## ANZSCO as a legacy alias

`OccupationRef` accepts `anzsco` alongside `osca`. This is not hedging: insurer underwriting
manuals, and a good deal of adjacent government process, still cite ANZSCO codes. The ABS publishes
ANZSCO-to-OSCA correspondence tables under Data Downloads on the page above, so supporting both
costs an implementer nothing.

Where both are supplied, `osca` wins. This is stated in the schema.

## What we added, and why

OSCA exists for labour statistics. It has no concept of working at height, trade qualification,
underground or offshore work, or the proportion of manual duties — yet those facts routinely move an
occupation by one or more rating classes, and two OSCA-identical clients can price materially
differently because of them.

`qualifiers.yaml` therefore defines a small set of risk qualifiers layered over the OSCA code. These
dimensions are **ours**, derived from how underwriting manuals discriminate within an occupation.
They are deliberately dimensions rather than descriptions: the standard says "working height in
metres", and each insurer bands that however its own manual does.

Nothing in `qualifiers.yaml` is copied from any aggregator or insurer document. Where domain
research established that a dimension matters, the dimension was defined here from first
principles; no name, code, string or band boundary was carried across. See
[`../docs/PROVENANCE-RULES.md`](../docs/PROVENANCE-RULES.md) for the distinction and how it is
enforced.

## Obtaining the classification data

The OSCA structure is **not vendored in this repository**. It is a published ABS dataset with its
own licence and update cycle, and mirroring it here would create a second, staler copy of something
the ABS already distributes.

To obtain it:

1. Open the landing page above and go to the **Data downloads** tab.
2. Take the spreadsheet of all OSCA categories and their descriptions (a post-release update dated
   28 July 2025 added this file and refreshed the correspondence tables).
3. Take the **ANZSCO ↔ OSCA correspondence tables** from the same tab if you need the legacy alias.

Attribute the ABS per the Creative Commons terms in anything you publish from it.

## Open item

A conversion of the ABS spreadsheet into a stable, diffable CSV under this directory — with a
recorded download date and checksum — is still to be done. Until then, implementations should read
the codes directly from the ABS release. Do not hand-transcribe: a mistyped occupation code produces
a wrong premium that looks entirely normal.
