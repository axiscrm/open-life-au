# Requirements contract

Outstanding underwriting requirements on life applications — what an application is waiting on, and
who it is waiting on. `v0.1.0` — draft, open for comment.

- Contract: [`openapi.yaml`](openapi.yaml) · bundled at [`dist/requirements/openapi.yaml`](../../dist/requirements/openapi.yaml)
- The vocabulary: [`core/schemas/requirement-vocabulary.yaml`](../../core/schemas/requirement-vocabulary.yaml)

> Known internally as **suspense**. The contract uses "outstanding underwriting requirements" because
> that is the term an insurer's underwriting team will recognise.

## Why this contract exists

An application in underwriting accumulates a list of things still owed before a decision can be made:
a blood profile, a report from the client's own doctor, a signature, an income statement. Insurers
communicate that list constantly — and almost none of them code it.

What arrives is a sentence. So every consumer that wants to count, age, route or chase those items
invents its own key for each one, two consumers reading the same insurer's message produce different
keys, and nobody can answer *"how many of our applications are held up on medicals"*. That is not an
insurer failing; it is a missing shared vocabulary.

## The vocabulary is the point

[`RequirementType`](../../core/schemas/requirement-vocabulary.yaml) is the most valuable thing here
and the single most useful thing to ask an insurer to populate. It is deliberately three fields, not
one:

| Field | Carries |
|---|---|
| `requirement_type` | The shared vocabulary — what kind of thing is owed. Comparable across insurers |
| `insurer_code` | The insurer's own code, verbatim, where it has one |
| `description` | The insurer's own wording, verbatim, **always required** |

Mapping is lossy by design, so the lossless copy travels alongside it. "Specialist report" does not
tell an adviser which specialist, for what, or by when — the insurer's own sentence usually does, and
it MUST NOT be dropped in favour of the type.

## Shape

**Snapshot-first, and here that is not a preference.** `GET /cases` returns everything currently
outstanding, paged. Every contract in this standard is snapshot-first for good reasons; this is the
only one with no workable alternative.

Insurers emit requirements as *events*: a notice when an item is raised, and — sometimes, from some
insurers — another when it is met. A list built from those is only as good as the messages it never
missed, and nothing in the stream says whether it missed one. Several sources carry **no receipt
signal at all**, so no safe closing rule can be derived from them and items stay open until a human
clears them by hand. Lists built this way only ever grow, and end up reconciled by telephone.

A complete outstanding-requirements snapshot dissolves all of it. Everything in it is outstanding;
anything absent is done with, and the difference between met, waived and moot stops mattering because
the next action is the same.

**Cases, not requirement rows.** A requirement is the unit of work, but a case is the unit of action —
an adviser rings the client once about all three outstanding items, not three times. So requirements
nest under the application, rather than arriving as flat rows repeating the client's name, date of
birth, product and adviser code on every line. Same reasoning as the policy contract's
policy-with-covers shape.

**Events are optional and explicitly not a substitute.** The two webhooks exist for what has a
deadline attached — a counter-offer that expires, an application about to be closed. An implementation
that pushes events *instead of* serving snapshots reproduces the exact problem this contract removes.

## What must not diverge from the other contracts

`adviser_code` and everything around it comes from [`core/schemas/distribution.yaml`](../../core/schemas/distribution.yaml),
shared with the policy contract — a consumer that grouped a book by one contract's notion of an
adviser code and a worklist by another's would split one adviser's work across two buckets with
nothing looking wrong. The snapshot envelope comes from [`core/schemas/snapshot.yaml`](../../core/schemas/snapshot.yaml),
so absence means the same thing here as everywhere else.

**`InsuredLife` is deliberately not shared** with the policy contract's `PolicyHolder` or quoting's
anonymous `Insured`. The three describe people at three different moments under three different
obligations, and the reason to keep them apart is the direction the mistake runs: merging identity
schemas tends to push fields *into* the anonymous one. See the header of
[`policy-holder.yaml`](../policy/components/schemas/policy-holder.yaml).

## The two things to ask an insurer for

1. **Map your requirements to `requirement_type`.** Without it their book cannot be counted alongside
   anyone else's — declared as `capabilities.fields.requirement_type_mapping`.
2. **Populate `due_on`.** Without it every outstanding item looks equally urgent, which is the state
   consumers are in today. Several insurers set real deadlines that never reach the adviser.
