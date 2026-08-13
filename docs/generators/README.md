# Generating stubs and clients

The contract is plain OpenAPI 3.1, so you are not tied to the generators documented here. But these
are the ones run against every change in CI, with the exact flags below — and those flags are not
decoration. Each one is present because the default produced something wrong, and each page says
what and why.

Every page covers **all four contracts** — quoting, policy, requirements and commissions. The mechanics are
identical; you change one input path and one package name. [policy.md](policy.md) covers what
differs once a contract returns a paged snapshot, including the snapshot walk itself — the one piece
of client logic that is dangerous to get wrong. **Read it before consuming the requirements
contract too:** `GET /cases` uses the same envelope and the same absence rule, so the walk described
there applies unchanged. **It does NOT apply to commissions**, which is a ledger rather than a
snapshot and has no absence semantics at all — see [that contract's README](../../domains/commissions/README.md).

| Language | Page | Server stubs | Client |
|---|---|---|---|
| TypeScript | [typescript.md](typescript.md) | validator recipe | three options — types only, generated SDK, or runtime converters |
| Python | [python.md](python.md) | FastAPI recipe | Pydantic models, or a generated `attrs` client |
| Java | [java.md](java.md) | Spring interfaces | JDK `HttpClient` |
| C# / .NET | [csharp.md](csharp.md) | ASP.NET Core controllers | RestSharp or `HttpClient` |
| Go | [go.md](go.md) | `net/http` or Gin | ✓ |
| Ruby | [ruby.md](ruby.md) | — client models only, see the page | Faraday gem |

Plus [policy.md](policy.md) — cross-language notes on generating from and consuming the policy
contract.

### Why these six, and what is missing

Java and C# first, because that is what large Australian insurers and their policy administration
platforms actually run. TypeScript and Python next, for the digital and data teams. Go and Ruby for
newer platforms and smaller shops.

Deliberately absent, and the reasoning, so you can tell us if we have it wrong:

- **Kotlin** — runs against the Java output through JVM interop, and `openapi-generator -g
  kotlin-spring` works if you prefer native Kotlin. Not separately documented because nothing about
  this contract behaves differently there.
- **PHP** — `php-symfony`, `php-slim4` and others all work. Not documented because we have not seen
  demand; say the word and it takes an afternoon.
- **Rust, Elixir, Scala** — supported by openapi-generator, unlikely in this market.

If you need a language that is not here, open an issue. The contract is plain OpenAPI 3.1 and
openapi-generator covers roughly fifty targets, so the answer is usually "yes, and here are the two
flags you will need" — the value of a page here is the flags and the traps, not the ability to
generate at all.

Each page stands alone: prerequisites, fetching the contract, the command, what you get, and the
traps specific to that toolchain. Start at the one you need — there is nothing to read first.

## What you generate from

Two self-contained files, every `$ref` already resolved. You do not need to clone this repository:

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/policy/openapi.yaml
```

Generate two packages, not one. The contracts share `core/` schemas by `$ref`, so `Money`, `Problem`
and `CoverType` are identical in both today — but they version independently and will drift, so
merging the generated output stores up a conflict.

## One file or many?

Whether you get a single module or a package is a property of the generator, not of this contract:

| Generator | Output |
|---|---|
| `openapi-typescript` | one `.d.ts` — no multi-file mode by design, since it emits types with no runtime |
| `@hey-api/openapi-ts` | 16 files — types, an SDK function per operation, a configured client |
| `openapi-generator -g typescript-fetch` | ~67 files, one model per file, with runtime converters |
| `datamodel-code-generator` | one `.py` module — it mirrors its input, so one document gives one module even if you pass a directory to `--output` |
| `openapi-python-client` | a package, one module per model |
| `openapi-generator` (Java, C#, Go, Ruby) | a package, one class or file per model |

So single-file output is never something you are stuck with — in both TypeScript and Python there is
a multi-file generator documented alongside the single-file one.

Two things need more than their own language runtime. `@hey-api/openapi-ts` requires a
**TypeScript 5.x** peer (7.x breaks it). And **openapi-generator requires a JDK** — it is a Java tool
behind an npm wrapper, and it is what generates Java, C#, Go, Ruby *and* one of the three TypeScript
options. Python is the only language here that needs nothing but itself.

## Documentation comes through — make sure you keep it

Every generator here can emit the contract's descriptions, and you should let it. They are not
commentary: they carry the normative rules JSON Schema cannot express. The clearest example is the
loadings map, where a benefit present with a value of `0` means "explicitly no loading" and a
benefit absent from the map means "no instruction" — a distinction no amount of type information
conveys.

The flags that turn documentation on are in each page's command. In Python they are easy to miss:
without them, descriptions end up only in `Field(...)` metadata and your classes have no docstrings
at all.

## Am I on the current contract?

Check this **first** whenever a generator complains. Most reported failures so far have been a copy
of `openapi.yaml` taken before a fix, not a live problem — the file gets downloaded once, copied into
a project, and then outlives the version it came from.

```bash
curl -s https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml \
  | diff - openapi.yaml && echo "current" || echo "STALE — re-download"
```

A caveat worth knowing while the contract is pre-1.0: `info.version` reads `0.1.0` and will not move
until the first release, so **the version field cannot tell you whether your copy is current**. The
`diff` above is the only reliable answer today. Once releases begin, `info.version` tracks the
`quoting-v*` tag and comparing it is enough.

If you have pulled a copy into your own repository, pin the refresh rather than the file: fetch it in
your build, or record the commit you took it from.

## If a generator misbehaves

Tell us. That is a defect in the contract, not in your setup — and we would rather hear it from you
than have you work around it silently.

This has already happened twice, and both were found by running generators rather than by reading
the schema. Neither was visible to linting or schema validation.

**The cover discriminant was pinned with `const`.** That is correct JSON Schema and reads better
than the alternative. But a discriminator is resolved through each variant's *allowable values*,
which only `enum` populates, so openapi-generator died with a NullPointerException and emitted
**nothing at all** — no models, no interfaces. Every Java implementer would have been blocked at the
first step.

**Covers narrowing a shared enum used `allOf: [$ref to the full enum, {enum: [subset]}]`.** The most
precise way to say it. openapi-python-client answers that with "Cannot take allOf a non-object",
**silently drops the entire cover**, and exits successfully — it took TPD, trauma and business
expenses with it while writing 79 healthy-looking files. A generator that fails loudly is a
nuisance; one that quietly hands you a client missing three of the seven covers is a defect nobody
notices until an insurer cannot quote.

**The policy contract's `webhooks` block aborted openapi-generator's Spring target.** OpenAPI 3.1
declares webhooks natively and most tooling handles them, so this looked safe — it lints clean and
TypeScript is happy. But `SpringCodegen.reformatProvideArgsParams` dereferences
`Operation.getExtensions()` without a null check, and a webhook operation with no extensions returns
null. NullPointerException, nothing emitted, Java implementers blocked again. The fix is a
meaningless `x-openlife-webhook: true` on each webhook operation, which must not be removed.

Because of these, CI does not merely check that generation succeeded. It asserts the load-bearing
schemas **survived** into every generator's output for **every contract** — all seven covers for
quoting, and `Policy`/`PolicyPage`/`PolicyHolder`/`Arrears` for policy. Counting files would have
passed two of the three bugs above.

## Adding a generator to this set

Anything documented here is tested here — otherwise the documentation rots into a set of commands
that used to work.

1. Add a page in this directory following the same shape.
2. Add a case to [`scripts/check-codegen.sh`](../../scripts/check-codegen.sh), asserting output
   exists **and** that `assert_all_covers` passes. Do not settle for a file count: more than one
   generator exits `0` having written nothing, and another writes plenty while dropping schemas.
3. Add the language to the `codegen` matrix in
   [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). Every documented language runs on
   every pull request; they are matrix entries, so six generators cost roughly the wall-clock of one.
4. Note any flag you needed and what the default did wrong. That sentence is the most valuable part
   of the page.
