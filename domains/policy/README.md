# Policy contract

In-force policy data, arrears and status changes. `v0.1.0` — draft, open for comment.

- Contract: [`openapi.yaml`](openapi.yaml) · bundled at [`dist/policy/openapi.yaml`](../../dist/policy/openapi.yaml)
- Generating and consuming it: [`docs/generators/policy.md`](../../docs/generators/policy.md)

## Why this contract exists

Adviser software obtains this data today by logging into each insurer's portal overnight, exporting a
spreadsheet, and parsing whatever layout that insurer happens to use this quarter. That is fragile on
the consumer's side and a support burden on the insurer's — a portal change breaks the consumer, and
the insurer hears about it.

Unlike quoting, this asks an insurer to *replace* something it already does rather than build
something new, and it is back-office operations rather than distribution or pricing. It may well be
the easier of the two conversations.

## Shape

**Snapshot-first.** `GET /policies` returns the whole book, paged. It is the smallest thing an insurer
can build — for most it is a report they already produce — and it carries a property a change feed does
not: a policy that has disappeared is no longer in force, so no tombstones, no missed-event problem,
and a failed run self-corrects.

`changed_since` is optional and declared in `capabilities`, never a replacement, because an
incremental feed that omits terminations cannot detect a lapse.

**Events are OpenAPI 3.1 `webhooks`, not AsyncAPI.** 3.1 declares webhooks natively, so it is one
document, one set of schemas shared by ordinary `$ref`, and one toolchain. AsyncAPI earns its keep
describing brokers and multi-protocol topologies; this is three HTTP callbacks. All three are
optional — everything they carry is observable by comparing snapshots, just later.

**Arrears live on the policy**, so one call answers what two separate scrapes answer today — and are
*also* served as a worklist of their own by `GET /arrears`.

Both, not either. On the insurer's side collections and the in-force book are usually different
reports from different systems on different cadences, so the two operations are declared
independently in `capabilities`: an insurer that can only produce the arrears report implements
`GET /arrears` alone and is conformant. That matters, because arrears is the record with a deadline
attached and the one still behind a portal login.

The absence rule is **weaker** on `/arrears` than on `/policies`, and this is the thing to get right.
A policy that drops out of the worklist is no longer in arrears — but that is either because it was
paid or because it lapsed, and the worklist cannot say which. Read the status from `/policies` before
assuming the happy case.

## What must not diverge from quoting

A policy record refers to insurer, brand, product, covers, ownership, structure, premium frequency,
stamp duty and policy fees. Every one is already defined in `core/` for quoting, and every one must
mean the same thing here — reconciling a policy against the quote that produced it is a large part of
why this contract exists. Extend `core/`; do not redefine locally.

**The one deliberate exception is the policy holder.** `PolicyHolder` carries full client PII and lives
in this contract, not `core/`, physically separate from quoting's anonymous `Insured`. The two encode
opposite obligations and merging them would most likely push names into a quote request that is
broadcast to a panel. See the header of
[`components/schemas/policy-holder.yaml`](components/schemas/policy-holder.yaml).
