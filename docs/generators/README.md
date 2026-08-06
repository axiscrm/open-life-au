# Generating stubs and clients

The contract is plain OpenAPI 3.1, so you are not tied to the generators documented here. But these
are the ones run against every change in CI, with the exact flags below — and those flags are not
decoration. Each one is present because the default produced something wrong, and each page says
what and why.

| Language | Page | Server stubs | Client | Output shape |
|---|---|---|---|---|
| TypeScript | [typescript.md](typescript.md) | types + validator recipe | `openapi-fetch` | one `.d.ts` |
| Python | [python.md](python.md) | FastAPI recipe | `httpx`, or generated | one module, or a package |
| Java | [java.md](java.md) | Spring interfaces | JDK `HttpClient` | package, one class per model |

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
| `datamodel-code-generator` | one `.py` module — it mirrors its input, so one document gives one module even if you pass a directory to `--output` |
| `openapi-python-client` | a package, one module per model |
| `openapi-generator` | a package, one class per model |

If you want a file-per-model tree in TypeScript, use [`@hey-api/openapi-ts`](https://heyapi.dev/) or
`openapi-generator -g typescript-fetch`. In Python, use `openapi-python-client`.

## Documentation comes through — make sure you keep it

Every generator here can emit the contract's descriptions, and you should let it. They are not
commentary: they carry the normative rules JSON Schema cannot express. The clearest example is the
loadings map, where a benefit present with a value of `0` means "explicitly no loading" and a
benefit absent from the map means "no instruction" — a distinction no amount of type information
conveys.

The flags that turn documentation on are in each page's command. In Python they are easy to miss:
without them, descriptions end up only in `Field(...)` metadata and your classes have no docstrings
at all.

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
