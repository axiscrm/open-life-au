# Product features — provenance

This file records where the vocabulary in [`features.yaml`](features.yaml) came from, so the claim
is auditable rather than asserted. See also [`../docs/PROVENANCE-RULES.md`](../docs/PROVENANCE-RULES.md)
and [`PROVENANCE.md`](PROVENANCE.md), which records the occupation baseline.

## Why this file exists

`PROVENANCE.md` can point at the ABS and stop, because someone else maintains the occupation
classification and publishes it openly. There is no equivalent body enumerating product features
for the Australian life market, so this standard defines them — and a standard that defines its own
vocabulary owes a much longer answer to "on what basis?".

The answer is: on the basis of the disclosure documents the products are actually sold under.

## Sources

Product disclosure statements for the eleven insurers on a full retail panel. Each is the issuer's
own document, and each entry in `features.yaml` names the ones it was taken from.

| Key | Issuer | Product | Document date |
|---|---|---|---|
| `neos` | NEOS | NEOS Protection | 6 December 2024 |
| `tal` | TAL | Accelerated Protection | 12 December 2025 |
| `mlc` | Acenda | Acenda Insurance | 11 April 2026 |
| `aig` | AIA | AIA Priority Protection | 31 August 2026 |
| `cle` | ClearView | ClearView ClearChoice | 26 April 2026 |
| `mlp` | MetLife | MetLife Protect | 16 November 2025 |
| `ing` | OnePath | OnePath OneCare | 28 March 2026 |
| `pps` | PPS Mutual | Professionals Choice | 13 December 2024 |
| `zur` | Zurich | Zurich Wealth Protection | 1 November 2025 |
| `enc` | Encompass | Encompass Protection | 26 September 2025 |
| `fut` | Futura | Futura Protection | 1 October 2025 |

Read on 3 September 2026. Document dates are the issuer's own as printed on each document.

A twelfth source, for three conditions only, is the **Life Insurance Code of Practice** published by
the Council of Australian Life Insurers. It is recorded in the `baselines` block of `features.yaml`
rather than here, because it is a baseline the standard defers to rather than a document the
vocabulary was read from.

## Method

**Conditions** were taken from the critical illness schedules of the NEOS and TAL documents, which
list them in full and group them by body system. `features.yaml` keeps that grouping. Where the two
documents name the same condition differently — *deafness* against *loss of hearing* — the entry
carries one code and both documents are cited. Where one document splits what the other combines —
*encephalitis* and *meningitis* against *encephalitis and meningitis* — the entry follows the split,
because an insurer writing only one of the two cannot honestly declare a combined code.

Every full condition appears in **both** documents, with two exceptions that appear in the NEOS
document only: `prolonged_intensive_care` and `severe_rheumatoid_arthritis`. Every partial condition
was taken from the NEOS document; the TAL document structures its lesser-payment benefits
differently and they were not mapped for this version.

The **full and partial tiers are separate** because the products separate them. Early-stage cancers
and carcinoma in situ are partial conditions paying a proportion of the sum insured, not lesser
versions of `cancer`, and a product may pay nothing on one and something on the other.

Carcinoma in situ is **one condition, not one per anatomical site**. No document read for this file
enumerates it by site as separate covered conditions.

**Structural features** were confirmed by searching every document for the benefit by name. Every
entry in `features.yaml` is one that at least one issuer's document describes.

Seven candidates were removed because no document on the panel describes them: a loyalty benefit, a
crisis benefit, a severe disability benefit, a child care benefit, a transportation benefit, a
benefit extension, and child cover indexation. A vocabulary entry that no product carries is a
filter that can only ever return nothing.

Two cautions about that search, recorded because they change how much the result is worth. Loose
patterns produce false positives that look like evidence and are not — "travel costs" in an
underwriting clause is not a transportation benefit, and "no claim is payable" in an exclusion is
not a no-claim discount. Every removal above was confirmed against the benefit's exact name, not a
keyword. And absence of a name is weaker evidence than presence of one: a product might describe
the same benefit under wording nobody searched for. These seven were searched several ways before
being dropped, but the asymmetry is real.

Entries resting on a single document are kept deliberately, and named here so the thinness is
visible rather than buried:

| Entry | Evidenced in |
|---|---|
| `agreed_value` | PPS Mutual only |
| `severe_trauma_benefit` | ClearView only |
| `no_claim_discount` | AIA only, as a no-claim escalation benefit |
| `prolonged_intensive_care` (condition) | NEOS only |
| `severe_rheumatoid_arthritis` (condition) | NEOS only |

A feature only one insurer writes still belongs in a portable vocabulary: the insurer that writes it
needs a standard way to say so, and every other implementation answers `not_offered`, which is a
useful answer rather than a gap.

## What is not claimed

The definitions behind these names are **not** in this standard, and `features.yaml` says so at
length. Two products listing the same condition are not thereby comparable: the severity thresholds
and exclusions are the substance of what a critical illness product sells, and they differ. This
file records that a name is real and in market use. It records nothing about what any particular
insurer means by it.

Nor is the list closed. It reflects the panel above on the date above. `standard_feature` is
optional precisely so an insurer with a benefit this vocabulary does not reach can still declare it
under its own identifier.

## Maintenance

Products change and documents are reissued. Re-reading the panel is the maintenance task, and the
table above is what makes it possible to tell what has been superseded. An entry whose supporting
documents have all been reissued should be re-confirmed before it is relied on.
