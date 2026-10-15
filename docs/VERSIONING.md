# Versioning

Each contract in this repository versions independently. `quoting-v0.2.0` and `policy-v0.1.1`
are separate release trains, so an insurer implementing quoting is never asked to care that another
contract moved. Releases are cut by release-please from conventional commits; see
`release-please-config.json`.

Four contracts and `core` version separately. A contract's version is recorded in three places —
`domains/<name>/version.txt`, `info.version` in its `openapi.yaml`, and
`.release-please-manifest.json` — and is carried into both bundles in `dist/<name>/`.
`npm run versions` asserts those three agree. Separately, it checks `release-please-config.json`:
that the contract has a package entry there at all (without one it is never released), and that the
entry's `extra-files` lists the source `openapi.yaml` and both bundles. The config holds no version
of its own. The check exists because release-please only keeps these in step when it runs, and it
is parked to manual dispatch.

## Cutting a release

1. Run the **📦 Release** workflow by hand from the Actions tab (`release-please.yml` has no `push`
   trigger, deliberately).
2. release-please opens one release PR covering every contract with releasable commits since its last
   tag. `feat` and `fix` commits are releasable, and so is a breaking `!`; `chore` is not, so use it
   for anything that must not move a version.
3. That PR bumps `version.txt`, `info.version`, both `dist/` bundles and the manifest, and writes each
   contract's `CHANGELOG.md`. It is opened with `GITHUB_TOKEN`, so CI waits for a maintainer to approve
   the workflow run.
4. Merge it, then **run the 📦 Release workflow by hand again**. Merging does nothing on its own —
   the workflow has no `push` trigger — and it is this post-merge run that tags
   `<contract>-v<version>` and creates a GitHub release per contract.

## What is published, and where

- **`dist/` on `main`** — the bundles implementers generate from. `main` can be ahead of the last
  release; the same path under a tag (`.../open-life-au/quoting-v0.2.0/dist/...`) is the released
  contract.
- **The reference site** — <https://axiscrm.github.io/open-life-au/>, rebuilt from `main` by
  `docs-deploy.yml`. Each page's banner says whether it is the tagged release or ahead of it.
- **GitHub releases** — one per contract tag, with that contract's changelog.

Nothing is published to a package registry. The generated SDKs are recipes, not artefacts.

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

**Response enums are intended to be extensible.** A consumer should tolerate an unknown value by
passing it through rather than crashing, so that adding a cover type or an ownership form is a
**minor**.

**This is now true of the schemas, and the split is visible in their names.** Where an enum is used
in both directions, `core/schemas/cover-vocabulary.yaml` carries a closed request-facing schema and
an `x-extensible-enum` response-facing twin — `CoverType` against `CoverTypeResponse`, `Ownership`
against `OwnershipResponse`. The response-only vocabularies added since (`RequirementType`,
`CommissionType`, `PolicyStatusResponse`, `CaseStatus`) are extensible outright, because nothing
sends them.

Two consequences worth stating plainly, because they cut in opposite directions:

- **Adding a value to a response-facing enum is a minor.** That is the point of the asymmetry.
- **`oasdiff` does not know that.** `x-extensible-enum` is a vendor extension, so a diff still reports
  a new value as a change to watch. Judge it against this rule rather than against the tool, and use
  the `breaking-change-approved` label only when the change is genuinely breaking.

A consumer that fails a whole page on an unrecognised response value is not conformant, and several
schemas say so in as many words — an aborted snapshot walk reconciles nothing that night.

Without this asymmetry every additive change to a response would be breaking, the version number
would climb without anything useful happening, and the standard would stop being able to grow.

## Shared schemas in `core/`

`core/` holds what the contracts share: money, identifiers, problem documents, the snapshot
envelope, distribution, the occupation reference, and the cover, requirement and commission
vocabularies. A breaking change there is breaking for every contract that references it — and with
four contracts, every one of them references it.

A `core` release must therefore be accompanied by a release of each dependent contract.

> **This is a review responsibility, not an automated gate.** An earlier version of this document
> said it was "checked in CI"; no such check existed, which is worse than no guarantee because
> somebody relies on it. What CI does check is that the four places a version is written agree
> (`npm run versions`). The release-coupling rule is about releases rather than the working tree, so
> it needs a base ref to diff against and only bites once release-please is unparked — at which
> point it is worth automating properly.

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
