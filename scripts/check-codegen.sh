#!/usr/bin/env bash
#
# Run real code generators against BOTH contracts and assert they produced something usable.
#
# A valid OpenAPI document is not the same as a usable one. These contracts lean on
# oneOf + discriminator + unevaluatedProperties (quoting) and a 3.1 `webhooks` block (policy), which
# is exactly where generators diverge — and they diverge either silently or catastrophically, never
# politely. openapi-generator once died on the quoting schema with a NullPointerException and emitted
# nothing at all; openapi-python-client once dropped three of the seven covers and still exited 0.
# Neither was visible to linting or schema validation. Only running the generators found them.
#
# Hence the assertions. Counting files is not enough: one generator exits 0 having written nothing,
# and another writes plenty while quietly dropping schemas.
#
# Usage: scripts/check-codegen.sh <typescript|python|java|ruby|go|csharp>

set -euo pipefail

LANG_TARGET="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUOTING="$ROOT/dist/quoting/openapi.yaml"
POLICY="$ROOT/dist/policy/openapi.yaml"
OUT="${CODEGEN_OUT:-$ROOT/.codegen}"

for spec in "$QUOTING" "$POLICY"; do
  [ -f "$spec" ] || { echo "✗ $spec missing — run 'npm run bundle' first"; exit 1; }
done
mkdir -p "$OUT"

# EVERY generator is pinned to an exact version.
#
# Twice now a construct has passed locally and failed in CI purely because npx resolved a different
# patch release — once for openapi-typescript's example validation, which an older cached copy did not
# run at all. A floating major means the checks test a different toolchain on every machine and every
# day, so a red build tells you nothing about your change. Bump these deliberately, one at a time.
OG="@openapitools/openapi-generator-cli@2.24.0"
OPENAPI_TS="openapi-typescript@7.13.0"
HEY_API="@hey-api/openapi-ts@0.99.0"
DMCG_VERSION="0.36.0"
OPENAPI_PY_CLIENT_VERSION="0.26.1"

# PascalCase a contract name, portably.
#
# NOT `${contract^}`: that is bash 4+, and macOS still ships bash 3.2. CI runs Ubuntu with bash 5,
# so the parameter-expansion form passed there and failed for every macOS contributor with an
# opaque "bad substitution" — green CI, broken locally, which is the worst way round.
pascal_name() {
  case "$1" in
    quoting) echo "Quoting" ;;
    policy)  echo "Policy" ;;
    *)       echo "$1" ;;
  esac
}

# Fail if a generated tree is empty or implausibly small.
assert_files() {
  local dir="$1" pattern="$2" min="$3" label="$4"
  local n
  n=$(find "$dir" -name "$pattern" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$n" -lt "$min" ]; then
    echo "✗ $label: expected at least $min files matching '$pattern', found $n"
    exit 1
  fi
  echo "✓ $label: $n files"
}

# Assert every named symbol survived into the output.
#
# This is the check that matters most, and it exists because of a real incident: a generator
# rejected one schema construct, dropped three cover types, and still exited 0 having written 79
# files. Counting files would have called that a pass.
assert_symbols() {
  local label="$1"; local dir="$2"; shift 2
  local missing=""
  for symbol in "$@"; do
    grep -rqi -- "$symbol" "$dir" 2>/dev/null || missing="$missing $symbol"
  done
  if [ -n "$missing" ]; then
    echo "✗ $label: schemas silently dropped by the generator:$missing"
    exit 1
  fi
  echo "✓ $label: all expected schemas present"
}

QUOTING_SYMBOLS="LifeCover TpdCover TraumaCover IncomeProtectionCover BusinessExpensesCover NeedleStickCover ChildTraumaCover"
# The policy contract's load-bearing schemas. Arrears in particular: it is the most time-sensitive
# record in the contract, and it is nested two levels down, which is where generators lose things.
POLICY_SYMBOLS="Policy PolicyPage PolicyHolder Arrears PolicyCover SnapshotCoverage"

case "$LANG_TARGET" in
  typescript)
    # `--default-non-nullable=false` matters: without it openapi-typescript treats any property
    # carrying a `default` as REQUIRED, so optional request fields become mandatory in the generated
    # type and a minimal valid request fails to compile.
    #
    # Generate from `dist/`, with a minimal Redocly config that declares no `apis` block.
    #
    # Both details matter. Without `--redocly`, openapi-typescript picks up the repo's redocly.yaml,
    # prefers its `apis` roots over the path given here, and validates examples across the SPLIT
    # source — where it fails to resolve relative `$ref`s and aborts with no output. And `dist/` rather
    # than source because the bundle has no cross-file refs left to trip over.
    mkdir -p "$OUT/ts"
    for contract in quoting policy; do
      out="schema"; [ "$contract" = "policy" ] && out="policy"
      npx --yes "$OPENAPI_TS" "$ROOT/dist/$contract/openapi.yaml" \
        --redocly "$ROOT/redocly-codegen.yaml" \
        --default-non-nullable=false \
        -o "$OUT/ts/$out.d.ts"
    done
    assert_files "$OUT/ts" "*.d.ts" 2 "typescript types (openapi-typescript, both contracts)"
    assert_symbols "typescript quoting" "$OUT/ts/schema.d.ts" $QUOTING_SYMBOLS
    assert_symbols "typescript policy" "$OUT/ts/policy.d.ts" $POLICY_SYMBOLS

    # @hey-api/openapi-ts — the multi-file option. Needs a TypeScript 5.x peer; on 7.x it dies with
    # "Cannot read properties of undefined (reading 'AnyKeyword')".
    for contract in quoting policy; do
      rm -rf "$OUT/ts-heyapi-$contract"
      npx --yes "$HEY_API" -i "$ROOT/dist/$contract/openapi.yaml" -o "$OUT/ts-heyapi-$contract"
      assert_files "$OUT/ts-heyapi-$contract" "*.ts" 10 "typescript client (@hey-api, $contract)"
    done
    assert_symbols "hey-api quoting" "$OUT/ts-heyapi-quoting" $QUOTING_SYMBOLS
    assert_symbols "hey-api policy" "$OUT/ts-heyapi-policy" $POLICY_SYMBOLS
    for op in createQuote getCapabilities listOccupations matchOccupation; do
      grep -rq "$op" "$OUT/ts-heyapi-quoting/sdk.gen.ts" \
        || { echo "✗ hey-api: quoting operation $op missing"; exit 1; }
    done
    for op in listPolicies getPolicy getPolicyCapabilities; do
      grep -rq "$op" "$OUT/ts-heyapi-policy/sdk.gen.ts" \
        || { echo "✗ hey-api: policy operation $op missing"; exit 1; }
    done
    echo "✓ typescript (@hey-api): all operations present in both contracts"

    # typescript-fetch needs a JDK: openapi-generator is a Java tool behind an npm wrapper.
    #
    # `java -version` rather than `command -v java`. macOS ships a STUB at /usr/bin/java that exists
    # on PATH, satisfies `command -v`, and then answers "Unable to locate a Java Runtime" the moment
    # it is called. So the presence check passed on a machine with no JDK, the generator ran anyway,
    # and the job died mid-run with a Node stack trace instead of taking the skip branch below.
    if java -version >/dev/null 2>&1; then
      for contract in quoting policy; do
        rm -rf "$OUT/ts-fetch-$contract"
        npx --yes $OG generate \
          -i "$ROOT/dist/$contract/openapi.yaml" -g typescript-fetch \
          -o "$OUT/ts-fetch-$contract" --skip-validate-spec \
          -p supportsES6=true,modelPropertyNaming=original
        assert_files "$OUT/ts-fetch-$contract" "*.ts" 20 "typescript client (typescript-fetch, $contract)"
      done
      assert_symbols "typescript-fetch quoting" "$OUT/ts-fetch-quoting/models" $QUOTING_SYMBOLS
      assert_symbols "typescript-fetch policy" "$OUT/ts-fetch-policy/models" $POLICY_SYMBOLS
    else
      echo "· typescript-fetch skipped — no JDK on PATH (openapi-generator is a Java tool)"
    fi
    ;;

  python)
    # datamodel-codegen does not create the parent directory for its output file, so a fresh checkout
    # fails with FileNotFoundError while a machine that has run this before succeeds. Local-passes,
    # CI-fails again, and the same omission the typescript branch already handles.
    mkdir -p "$OUT/py"

    # Two generators, because they fail in different ways and only one of them is loud.
    for contract in quoting policy; do
      uvx --from "datamodel-code-generator==$DMCG_VERSION" datamodel-codegen \
        --input "$ROOT/dist/$contract/openapi.yaml" --input-file-type openapi \
        --output "$OUT/py/${contract}_models.py" --output-model-type pydantic_v2.BaseModel \
        --use-standard-collections --use-union-operator \
        --field-constraints --use-annotated \
        --use-schema-description --use-field-description \
        --target-python-version 3.12 --formatters black
    done
    assert_files "$OUT/py" "*_models.py" 2 "python models (datamodel-code-generator, both contracts)"
    grep -q "discriminator='cover_type'" "$OUT/py/quoting_models.py" \
      || { echo "✗ python: cover_type discriminator lost"; exit 1; }
    echo "✓ python: discriminated union preserved"
    assert_symbols "python quoting" "$OUT/py/quoting_models.py" $QUOTING_SYMBOLS
    assert_symbols "python policy" "$OUT/py/policy_models.py" $POLICY_SYMBOLS

    for contract in quoting policy; do
      rm -rf "$OUT/py-client-$contract"
      mkdir -p "$OUT/py-client-$contract"
      ( cd "$OUT/py-client-$contract" \
        && uvx --from "openapi-python-client==$OPENAPI_PY_CLIENT_VERSION" openapi-python-client generate \
             --path "$ROOT/dist/$contract/openapi.yaml" --overwrite )
      assert_files "$OUT/py-client-$contract" "*.py" 30 "python client (openapi-python-client, $contract)"
    done
    assert_symbols "python client quoting" "$OUT/py-client-quoting" $QUOTING_SYMBOLS
    assert_symbols "python client policy" "$OUT/py-client-policy" $POLICY_SYMBOLS
    ;;

  java)
    # interfaceOnly: the insurer implements a generated interface, so regeneration never overwrites
    # their code.
    for contract in quoting policy; do
      rm -rf "$OUT/java-server-$contract" "$OUT/java-client-$contract"
      npx --yes $OG generate \
        -i "$ROOT/dist/$contract/openapi.yaml" -g spring \
        -o "$OUT/java-server-$contract" --skip-validate-spec \
        -p interfaceOnly=true,useSpringBoot3=true,useTags=true,useJakartaEe=true,openApiNullable=false \
        --additional-properties=apiPackage=au.org.openlife.$contract.api,modelPackage=au.org.openlife.$contract.model
      assert_files "$OUT/java-server-$contract" "*.java" 20 "java server stubs ($contract)"

      # --library native: JDK HttpClient, so no transitive OkHttp/Gson pins to argue about with an
      # insurer's platform team.
      npx --yes $OG generate \
        -i "$ROOT/dist/$contract/openapi.yaml" -g java \
        -o "$OUT/java-client-$contract" --skip-validate-spec --library native \
        -p openApiNullable=false,useJakartaEe=true \
        --additional-properties=apiPackage=au.org.openlife.$contract.api,modelPackage=au.org.openlife.$contract.model
      assert_files "$OUT/java-client-$contract" "*.java" 20 "java client ($contract)"
    done
    assert_symbols "java quoting" "$OUT/java-server-quoting/src/main/java" $QUOTING_SYMBOLS
    assert_symbols "java policy" "$OUT/java-server-policy/src/main/java" $POLICY_SYMBOLS

    # Money must stay a String all the way into Java. If it ever becomes double, premiums drift.
    money="$OUT/java-server-quoting/src/main/java/au/org/openlife/quoting/model/Money.java"
    grep -qE "private +String +amount" "$money" \
      || { echo "✗ java: Money.amount is not a String — decimal precision lost"; exit 1; }
    echo "✓ java: Money.amount is String"

    cover="$OUT/java-server-quoting/src/main/java/au/org/openlife/quoting/model/CoverRequest.java"
    grep -q "JsonSubTypes" "$cover" \
      || { echo "✗ java: CoverRequest lost its polymorphism"; exit 1; }
    echo "✓ java: cover polymorphism preserved"
    ;;

  ruby)
    # Client only. `ruby-sinatra` emits a 13-file scaffold with no models at all — see
    # docs/generators/ruby.md.
    for contract in quoting policy; do
      rm -rf "$OUT/ruby-$contract"
      npx --yes $OG generate \
        -i "$ROOT/dist/$contract/openapi.yaml" -g ruby -o "$OUT/ruby-$contract" --skip-validate-spec \
        --additional-properties=gemName=openlife_$contract,moduleName=OpenLife$(pascal_name "$contract")
      assert_files "$OUT/ruby-$contract" "*.rb" 20 "ruby client ($contract)"
    done
    assert_symbols "ruby quoting" "$OUT/ruby-quoting" $QUOTING_SYMBOLS
    assert_symbols "ruby policy" "$OUT/ruby-policy" $POLICY_SYMBOLS
    grep -q "openapi_discriminator_name" "$OUT/ruby-quoting/lib/openlife_quoting/models/cover_request.rb" \
      || { echo "✗ ruby: CoverRequest lost its discriminator"; exit 1; }
    echo "✓ ruby: discriminated union preserved"
    ;;

  go)
    for contract in quoting policy; do
      rm -rf "$OUT/go-$contract"
      npx --yes $OG generate \
        -i "$ROOT/dist/$contract/openapi.yaml" -g go -o "$OUT/go-$contract" --skip-validate-spec \
        --additional-properties=packageName=openlife$contract,isGoSubmodule=true
      assert_files "$OUT/go-$contract" "*.go" 20 "go client ($contract)"
    done
    assert_symbols "go quoting" "$OUT/go-quoting" $QUOTING_SYMBOLS
    assert_symbols "go policy" "$OUT/go-policy" $POLICY_SYMBOLS
    # Go has no decimal type in its standard library, so a generator that turned this into float64
    # would be silently lossy on every premium.
    grep -qE "Amount string" "$OUT/go-quoting/model_money.go" \
      || { echo "✗ go: Money.Amount is not a string — decimal precision lost"; exit 1; }
    echo "✓ go: Money.Amount is string"
    ;;

  csharp)
    for contract in quoting policy; do
      rm -rf "$OUT/csharp-$contract" "$OUT/aspnetcore-$contract"
      npx --yes $OG generate \
        -i "$ROOT/dist/$contract/openapi.yaml" -g csharp -o "$OUT/csharp-$contract" --skip-validate-spec \
        --additional-properties=packageName=OpenLife.$(pascal_name "$contract"),targetFramework=net8.0
      assert_files "$OUT/csharp-$contract" "*.cs" 20 "csharp client ($contract)"

      npx --yes $OG generate \
        -i "$ROOT/dist/$contract/openapi.yaml" -g aspnetcore -o "$OUT/aspnetcore-$contract" --skip-validate-spec \
        --additional-properties=packageName=OpenLife.$(pascal_name "$contract"),aspnetCoreVersion=8.0,operationIsAsync=true
      assert_files "$OUT/aspnetcore-$contract" "*.cs" 20 "csharp server ($contract)"
    done
    assert_symbols "csharp quoting" "$OUT/csharp-quoting" $QUOTING_SYMBOLS
    assert_symbols "csharp policy" "$OUT/csharp-policy" $POLICY_SYMBOLS

    money=$(find "$OUT/csharp-quoting" -name Money.cs | head -1)
    grep -qE "public string Amount" "$money" \
      || { echo "✗ csharp: Money.Amount is not a string — use decimal, never double"; exit 1; }
    echo "✓ csharp: Money.Amount is string"
    ;;

  *)
    echo "usage: scripts/check-codegen.sh <typescript|python|java|ruby|go|csharp>"
    exit 2
    ;;
esac

echo "✓ ${LANG_TARGET} generation OK (quoting + policy)"
