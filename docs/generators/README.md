# Generating stubs and clients

The contract is plain OpenAPI 3.1, so you are not tied to the generators documented here. But these
are the ones run against every change in CI, with the exact flags below — and those flags are not
decoration. Each one is present because the default produced something wrong, and each page says
what and why.

| Language | Page | Generators covered |
|---|---|---|
| TypeScript | [typescript.md](typescript.md) | `openapi-typescript`, `@hey-api/openapi-ts`, `openapi-generator -g typescript-fetch` |
| Python | [python.md](python.md) | `datamodel-code-generator`, `openapi-python-client` |
| Java | [java.md](java.md) | `openapi-generator` — Spring interfaces and a JDK `HttpClient` client |

Each page stands alone: prerequisites, fetching the contract, the command, what you get, and the
traps specific to that toolchain. Start at the one you need — there is nothing to read first.

## What you generate from

`dist/quoting/openapi.yaml` — a single self-contained file with every `$ref` already resolved. You
do not need to clone this repository:

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
```

## One file or many?

Whether you get a single module or a package is a property of the generator, not of this contract:

| Generator | Output |
|---|---|
| `openapi-typescript` | one `.d.ts` — no multi-file mode by design, since it emits types with no runtime |
| `@hey-api/openapi-ts` | 16 files — types, an SDK function per operation, a configured client |
| `openapi-generator -g typescript-fetch` | ~67 files, one model per file, with runtime converters |
| `datamodel-code-generator` | one `.py` module — it mirrors its input, so one document gives one module even if you pass a directory to `--output` |
| `openapi-python-client` | a package, one module per model |
| `openapi-generator` (Java) | a package, one class per model |

So single-file output is never something you are stuck with — in both TypeScript and Python there is
a multi-file generator documented alongside the single-file one.

Two of these need something beyond their own language runtime: `@hey-api/openapi-ts` requires a
**TypeScript 5.x** peer (7.x breaks it), and anything using `openapi-generator` — including the
TypeScript target — requires a **JDK**, since it is a Java tool behind an npm wrapper.

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

Because of the second, CI does not merely check that generation succeeded. It asserts **all seven
covers survived** into every generator's output, since counting files would have passed that bug.

## Adding a generator to this set

Anything documented here is tested here — otherwise the documentation rots into a set of commands
that used to work.

1. Add a page in this directory following the same shape.
2. Add a case to [`scripts/check-codegen.sh`](../../scripts/check-codegen.sh), asserting output
   exists **and** that `assert_all_covers` passes. Do not settle for a file count: more than one
   generator exits `0` having written nothing, and another writes plenty while dropping schemas.
3. Add the language to the `codegen` matrix in
   [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).
4. Note any flag you needed and what the default did wrong. That sentence is the most valuable part
   of the page.
