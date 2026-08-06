# Versioning

Each contract in this repository versions independently. `quoting-v0.2.0` and `policy-v0.1.0` are
separate release trains, so an insurer implementing quoting is never asked to care that another
contract moved. Releases are cut by release-please from conventional commits; see
`release-please-config.json`.

## Semantics

| Bump | Contains |
|---|---|
| **patch** | Descriptions, examples, documentation. No schema change. |
| **minor** | New operations. New **optional** request fields. New response fields. New values in **response-only** enums. |
| **major** | Everything else. A new URL major (`/v2`), with both majors served side by side for at least twelve months. |

While a contract is below `1.0`, `bump-minor-pre-major` applies: a breaking change is a minor and a
feature is a patch, so `0.x` stays honest about being unstable. This mirrors the convention already
in use across our other repositories.

## Enum direction — the rule that keeps the standard from freezing

Enums behave **differently depending on direction**, and this asymmetry is deliberate.

**Request enums are closed.** A server MUST reject an unrecognised value with `422`
`unsupported-value`. A consumer that misspells a premium structure needs a failure, not a silent
substitution — an unrecognised value quietly priced as a default is a mis-quote nobody detects.

**Response enums are extensible.** A consumer MUST tolerate an unknown value by passing it through
for display rather than crashing. Adding a cover type or an ownership form is therefore a **minor**.

Without this asymmetry every additive change to a response would be breaking, the version number
would climb without anything useful happening, and the standard would stop being able to grow.

## Shared schemas in `core/`

`core/` holds what the contracts share: money, identifiers, problem documents, the cover
vocabulary, the occupation reference. A breaking change there is breaking for every contract that
references it.

A `core` release must therefore be accompanied by a release of each dependent contract. This is
checked in CI rather than left to memory.

## What a consumer should rely on

- `spec_version` in `GET /capabilities` is the authoritative statement of what an implementation
  was built against. Read it rather than inferring from behaviour.
- `X-OpenLife-Spec-Version` on every response catches an implementation that has moved without
  announcing it.
- The URL major is the only thing guaranteed stable across a breaking change. Pin to it.

## Deprecation

A field or operation being removed in the next major is marked `deprecated: true` with a
`description` naming the replacement and the earliest version in which it will disappear. Minimum
twelve months between marking and removal.

We will permanently be running several versions across several independent implementers.
Coordinated upgrades do not happen, so nothing in the design should assume one.

## Breaking changes in practice

CI runs `oasdiff` against the base branch and fails on a breaking change. That is not a
prohibition — it is a requirement that the change be deliberate. To proceed:

1. Apply the `breaking-change-approved` label to the pull request.
2. Add a migration note under `docs/migration/`.
3. Say in the release notes what an implementer has to do, and by when.
