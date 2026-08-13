# Commissions contract

Commission statements and their lines. `v0.1.0` — draft, open for comment.

- Contract: [`openapi.yaml`](openapi.yaml) · bundled at [`dist/commissions/openapi.yaml`](../../dist/commissions/openapi.yaml)
- The vocabulary: [`core/schemas/commission-vocabulary.yaml`](../../core/schemas/commission-vocabulary.yaml)

## Why this contract exists

Commission arrives as a spreadsheet. Every insurer's is shaped differently, so every consumer runs a
per-insurer parser over it, and each parser encodes one insurer's column names and one insurer's
wording for what a line means. Nothing about that is recoverable when a statement changes shape — and
statements change shape.

## A ledger, not a snapshot — the one thing to understand first

The other three contracts in this standard are **snapshots**: they describe a current state, and
their central rule is that a record which has disappeared is gone. That rule is what removes
tombstones and makes a failed run self-correcting.

**It is exactly wrong here.** A commission statement is a ledger entry — issued once, for a period,
never restated. A correction is not an edit to a past statement; it is a new line on a later one.

So this contract deliberately does **not** use `core/schemas/snapshot.yaml`, and its response
envelopes offer no absence semantics at all:

- **Absence means nothing.** A statement that stops appearing has not been cancelled. Never remove an
  ingested payment because a later call did not return it.
- **Re-fetching is safe and expected.** Deduplicate on `statement_id` and `line_id`.

Reusing the snapshot envelope would have been cheap and would have looked consistent. It would also
have invited a consumer to delete its own financial history from a response that validated perfectly.

## Completeness is proven with money, which is stronger

Every statement declares `line_count` and `total_amount` independently of its lines. Before ingesting,
a consumer walks every page of lines and checks that the count matches and the signed sum equals the
declared total, to the cent.

That is a better guarantee than any snapshot here can give. A snapshot's page checks prove a consumer
walked every *page*; they cannot prove it received every *row*. Here a single dropped line changes the
sum, so it cannot pass unnoticed — and a dropped commission line is otherwise invisible, because a
statement carrying 38 of its 40 lines looks precisely like one that had 38.

It follows that **everything moving the money must be a line**. An insurer netting off an advance
recovery in a footer rather than as a line produces a statement that cannot reconcile, with nothing to
say why.

> The worked example in this contract failed that check on its first draft — the declared total was
> $600 out and the schema validated it happily. `npm run examples` now runs the reconciliation over
> every committed example, so the published one cannot teach the opposite of the rule it illustrates.

## Signed amounts

Negatives are ordinary: a clawback, a lapse recovery and an advance repayment are all negative lines,
and a whole statement may be negative in a bad period. Consumers MUST NOT reject, discard or
absolute-value them.

This is the one place in the standard where the arrears contract's `amount > 0` instinct is inverted.
There, a nil amount contradicts the record. Here, **the sign is the information** — which is why
`check-rejections` asserts a negative line is *accepted*, not just that bad ones are refused.

## The type vocabulary

`CommissionType` exists because the same concept — commission on new business — arrives from live
statements as at least six different strings, each recognised by one insurer's parser, with anything
unrecognised falling through to a default. When an insurer re-cases its own value, that insurer's new
business silently reclassifies as ongoing: the row count does not change, the total does not change,
only the type does. A reconciliation that balances on money never sees it.

**There is deliberately no `clawback` value.** The sign carries direction, the type carries purpose —
a clawback of new-business commission is `new_business` with a negative amount. A separate type would
mean every consumer summing new business had to know to subtract a second bucket, and the ones that
forgot would report a book as more profitable than it is while every individual figure looked right.

`advance` and `advance_repayment` *are* named separately, for the opposite reason: they are not
commission, and a consumer reporting "commission earned" must exclude both.

## Beyond what the source spec asked for

Three additions worth naming, because they are not in the field spec this was built from:

- **`paid_on` and `payment_reference`.** The statement date and the date money lands are routinely
  days apart, and matching a deposit by amount and date fails the moment two statements pay the same
  amount in a week. These are what make weekly bank reconciliation exact.
- **`basis`** — the premium and rate an amount was calculated from. Nothing supplies it today, and it
  is the difference between a commission figure you can accept and one you can check.
- **`sequence`** — a per-payee counter. Querying by period tells a consumer what it received; only a
  gap in a sequence tells it what it never did.

## What must not diverge from the other contracts

`policy_number` is [`core/schemas/identifiers.yaml#/PolicyNumber`](../../core/schemas/identifiers.yaml),
shared with the policy contract. That is the join — a commission line and a policy record are two
systems' views of one contract, matched on this value and nothing else, so two independently-worded
normalisation rules would eventually mean two subtly different keys.

`payee` and `adviser_code` are **different things** and both are required. The payee is the entity
that received the money, usually a licensee or practice; the adviser code is who earned it. Collapsing
them is why a licensee-level statement cannot currently be broken out per adviser without guesswork.
