#!/usr/bin/env bash
#
# Run a real code generator against the bundled contract and assert it produced something usable.
#
# A valid OpenAPI document is not the same as a usable one. This contract leans on
# oneOf + discriminator + unevaluatedProperties, which is exactly where generators diverge — and
# they diverge either silently or catastrophically, never politely. openapi-generator once died on
# this schema with a NullPointerException and emitted nothing at all, which would have blocked
# every Java implementer, and neither lint nor schema validation noticed. Only running it did.
#
# Hence the assertions: several generators exit 0 having written nothing, so counting output files
# is the only honest check.
#
# Usage: scripts/check-codegen.sh <typescript|python|java>

set -euo pipefail

LANG_TARGET="${1:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="$ROOT/dist/quoting/openapi.yaml"
OUT="${CODEGEN_OUT:-$ROOT/.codegen}"

[ -f "$SPEC" ] || { echo "✗ $SPEC missing — run 'npm run bundle' first"; exit 1; }
mkdir -p "$OUT"

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

case "$LANG_TARGET" in
  typescript)
    # `--default-non-nullable=false` matters: without it openapi-typescript treats any property
    # carrying a `default` as REQUIRED, so optional request fields like `campaign_codes` become
    # mandatory in the generated type and a minimal valid request fails to compile.
    # No path argument: openapi-typescript picks up redocly.yaml's `apis` block and the
    # `x-openapi-ts.output` key declared there. Passing a path as well is an error, not an override.
    npx --yes openapi-typescript@7 --default-non-nullable=false
    assert_files "$OUT/ts" "schema.d.ts" 1 "typescript types"
    grep -q "CoverRequest" "$OUT/ts/schema.d.ts" \
      || { echo "✗ typescript: CoverRequest union missing"; exit 1; }
    echo "✓ typescript: cover union present"
    ;;

  python)
    uvx --from datamodel-code-generator datamodel-codegen \
      --input "$SPEC" --input-file-type openapi \
      --output "$OUT/py/models.py" --output-model-type pydantic_v2.BaseModel \
      --use-standard-collections --use-union-operator \
      --field-constraints --use-annotated \
      --target-python-version 3.12 --formatters black
    assert_files "$OUT/py" "models.py" 1 "python models"
    # The discriminated union is the thing most likely to degrade into a bare Union.
    grep -q "discriminator='cover_type'" "$OUT/py/models.py" \
      || { echo "✗ python: cover_type discriminator lost"; exit 1; }
    echo "✓ python: discriminated union preserved"
    ;;

  java)
    # interfaceOnly: the insurer implements a generated interface, so regenerating never
    # overwrites their code.
    npx --yes @openapitools/openapi-generator-cli@2 generate \
      -i "$SPEC" -g spring -o "$OUT/java-server" --skip-validate-spec \
      -p interfaceOnly=true,useSpringBoot3=true,useTags=true,useJakartaEe=true,openApiNullable=false \
      --additional-properties=apiPackage=au.org.openlife.quoting.api,modelPackage=au.org.openlife.quoting.model
    assert_files "$OUT/java-server" "*.java" 40 "java server stubs"

    # --library native: JDK HttpClient, so no transitive OkHttp/Gson pins to argue about with an
    # insurer's platform team.
    npx --yes @openapitools/openapi-generator-cli@2 generate \
      -i "$SPEC" -g java -o "$OUT/java-client" --skip-validate-spec --library native \
      -p openApiNullable=false,useJakartaEe=true \
      --additional-properties=apiPackage=au.org.openlife.quoting.api,modelPackage=au.org.openlife.quoting.model
    assert_files "$OUT/java-client" "*.java" 40 "java client"

    # Money must stay a String all the way into Java. If it ever becomes double/BigDecimal-from-
    # number, premiums drift by cents and the comparison table is quietly wrong.
    money="$OUT/java-server/src/main/java/au/org/openlife/quoting/model/Money.java"
    grep -qE "private +String +amount" "$money" \
      || { echo "✗ java: Money.amount is not a String — decimal precision lost"; exit 1; }
    echo "✓ java: Money.amount is String"

    cover="$OUT/java-server/src/main/java/au/org/openlife/quoting/model/CoverRequest.java"
    grep -q "JsonSubTypes" "$cover" \
      || { echo "✗ java: CoverRequest lost its polymorphism"; exit 1; }
    echo "✓ java: cover polymorphism preserved"
    ;;

  *)
    echo "usage: scripts/check-codegen.sh <typescript|python|java>"
    exit 2
    ;;
esac

echo "✓ ${LANG_TARGET} generation OK"
