# Policy 0.1 → 0.2

0.2 makes four parts of the policy record dependable: what the policy costs, what each benefit is,
and what state the policy and each benefit are in. All four are breaking.

## Premium is required

`Policy.premium` is required. Inside it, `frequency` is required with at least one of `amount` (the
amount billed each period) and `annualised`. `amount` on its own is no longer required.

**Why.** What a policy costs is part of servicing it, and every in-force extract we have seen
carries it. Some carry only the annual figure, so requiring `amount` would have made those policies
unreportable.

**What to do.**

- *Implementations:* send `premium` on every policy, with `frequency` and whichever of `amount` and
  `annualised` you hold. Send both where you have both.
- *Consumers:* `premium.amount` may now be absent. Read `annualised` when it is.

## Cover type is required, from a closed policy list

`PolicyCover.cover_type` is required and takes `PolicyCoverType`: the core `CoverType` values plus
`funeral`, `severity_based` and `other`. The core `CoverType` and `CoverTypeResponse` are unchanged,
so quoting and requirements are unaffected.

The capability flag `fields.cover_type_mapping` is withdrawn, since every benefit now carries a
type. Declaring it is rejected (`additionalProperties: false`).

**What to do.**

- *Implementations:* map every benefit. One that fits none of the types (a waiver of premium, an
  accidental death benefit) is sent as `other`, with `benefit_name` saying what it is. Stop declaring
  `cover_type_mapping`.
- *Consumers:* every benefit has a `cover_type`, and every value is on the list.

## Statuses are a closed list with `other`

Policy and benefit `status` take `PolicyStatus`, which gains `other`. `PolicyStatusResponse` is
removed. A value outside the list now fails validation instead of passing through.

**Why.** An unknown status passed through tells a consumer nothing it can act on. Mapping it at the
source means every consumer reads the same seven values. A page still never fails on an insurer's
own wording, because that goes in `status_detail` beside `other`.

**What to do.**

- *Implementations:* map each of your statuses onto the list. Send one you cannot place as `other`,
  with your wording in `status_detail`.
- *Consumers:* treat `other` as "a state the list does not name". From 0.2, adding a value to either
  list is a breaking change, so a consumer can match on the list exhaustively.

## A benefit on an ended policy states its status

A benefit's `status` is still optional, and absent still reads as `in_force`. On a `lapsed`,
`cancelled` or `terminated` policy it is required.

**Why.** An insurer that lists only live benefits has nothing to say about their status, so absent
meaning `in_force` is right on a live policy. On an ended one it would record a live benefit on a
dead policy.

**What to do.**

- *Implementations:* when you report an ended policy, send each benefit's `status`.
- *Consumers:* store an absent benefit status as `in_force`. The schema allows it to be absent on
  any policy that is not `lapsed`, `cancelled` or `terminated`, which includes `pending` and `other`,
  so read the policy's own `status` for whether it has commenced or is in a state the list does not
  name.
