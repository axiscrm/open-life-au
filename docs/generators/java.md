# Java

[`openapi-generator`](https://openapi-generator.tech/) for both sides: Spring interfaces to
implement, and a client over the JDK's own `HttpClient`.

Verified against **openapi-generator 7.24.0**, pinned in this repository's `openapitools.json`.

## Prerequisites

A JDK 17 or later, and Node 20+ — the generator is a Java tool distributed through npm, so the npm
wrapper needs Node even though the output is Java.

```bash
java -version    # 17+
node -v          # 20+
```

## Get the contracts

Both are self-contained — every `$ref` already resolved — so these two files are all you need. You do
not need to clone this repository.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/policy/openapi.yaml
```

Generate them as two separate packages. Every command below shows quoting; substitute
`policy/openapi.yaml` and a different package name for the other. See
[policy.md](policy.md) for what differs — in particular the snapshot walk, which is the one piece of
client logic that is dangerous to get wrong.

## Generate the server interfaces

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g spring -o ./generated-server \
  -p interfaceOnly=true,useSpringBoot3=true,useTags=true,useJakartaEe=true,openApiNullable=false \
  --additional-properties=apiPackage=au.org.openlife.quoting.api,modelPackage=au.org.openlife.quoting.model
```

**`interfaceOnly=true` is the flag that makes this maintainable.** You get interfaces, not classes
with bodies to edit, so regenerating against a new contract version never touches your code — no
merge, no reapplying local changes. Every method defaults to `501 Not Implemented`, which means a
partial implementation compiles and runs from day one: implement `createQuote`, leave the occupation
endpoints for later, and the service still starts.

The other three:

- **`useSpringBoot3=true`** targets Spring Boot 3.x.
- **`useJakartaEe=true`** emits `jakarta.*` rather than the retired `javax.*`. Required for Spring
  Boot 3 and for any recent application server.
- **`openApiNullable=false`** avoids a dependency on `org.openapitools:jackson-databind-nullable`.
  This contract never needs to distinguish "explicitly null" from "absent" — absence is always the
  signal — so the extra type is cost without benefit.

### Implementing it

```java
@RestController
public class QuotingController implements QuotesApi {

    private final PricingEngine engine;

    @Override
    public ResponseEntity<QuoteResponse> createQuote(
            QuoteRequest request,
            UUID idempotencyKey,
            String requestId) {
        return ResponseEntity.ok(engine.price(request));
    }
}
```

That signature is what the generator produces. `Idempotency-Key` and `X-Request-Id` arrive as
optional parameters; both are worth honouring — see the nuances below.

## Generate the client

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g java -o ./generated-client --library native \
  -p openApiNullable=false,useJakartaEe=true \
  --additional-properties=apiPackage=au.org.openlife.quoting.api,modelPackage=au.org.openlife.quoting.model
```

**`--library native`** uses `java.net.http.HttpClient` from the JDK. The alternatives (`okhttp-gson`,
`resttemplate`, `webclient`) all drag in transitive HTTP and JSON dependencies with their own version
constraints, which in a large organisation is a conversation with the platform team rather than a
dependency bump. `native` has none of that.

## Wiring it into a build

The generator emits a complete Maven `pom.xml` and Gradle build. Most teams would rather generate
into their own module during the build than commit the output. Maven:

```xml
<plugin>
  <groupId>org.openapitools</groupId>
  <artifactId>openapi-generator-maven-plugin</artifactId>
  <version>7.24.0</version>
  <executions>
    <execution>
      <goals><goal>generate</goal></goals>
      <configuration>
        <inputSpec>${project.basedir}/src/main/resources/openapi.yaml</inputSpec>
        <generatorName>spring</generatorName>
        <configOptions>
          <interfaceOnly>true</interfaceOnly>
          <useSpringBoot3>true</useSpringBoot3>
          <useJakartaEe>true</useJakartaEe>
          <openApiNullable>false</openApiNullable>
        </configOptions>
        <apiPackage>au.org.openlife.quoting.api</apiPackage>
        <modelPackage>au.org.openlife.quoting.model</modelPackage>
      </configuration>
    </execution>
  </executions>
</plugin>
```

Pin the generator version. A generator upgrade can change the shape of the code it emits, and you
want that to be a deliberate change rather than something that arrives with a fresh checkout.

Maven Central coordinates for a prebuilt artifact are not published yet. Generate locally for now,
or ask and we will prioritise it.

## Nuances worth knowing

**`Money.amount` is a `String`. Convert to `BigDecimal`, never `double`.**

```java
BigDecimal total = new BigDecimal(line.getPremiums().getMonthly().getTotal().getAmount());
```

This is the single most consequential detail on this page. Premiums are summed and compared to the
cent; a `double` drifts, and a comparison table that is out by cents is a compliance problem rather
than a rounding nit. CI asserts on every change that `Money.amount` is still generated as `String`.

**The cover union is real polymorphism.** `CoverRequest` generates with Jackson annotations:

```java
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY,
              property = "cover_type", visible = true)
@JsonSubTypes({
  @JsonSubTypes.Type(value = LifeCover.class, name = "life"),
  @JsonSubTypes.Type(value = TpdCover.class, name = "tpd"),
  ...
})
```

So deserialisation gives you the concrete type, and `instanceof` or a switch over the seven covers
is exhaustive:

```java
for (CoverRequest cover : request.getCovers()) {
    if (cover instanceof IncomeProtectionCover ip) {
        var waitingPeriod = ip.getWaitingPeriod();   // only exists here
    }
}
```

**Read the frequency you need; never divide.** `getPremiums()` carries all six, and sub-annual
premiums include a frequency loading, so annual ÷ 12 is not the monthly premium. It will be
noticeably low and nothing will look wrong.

**A line with `allNeedsMet == false` is not an offer.** `getPremiums()` returns null. Filter before
sorting by price, or a failed line sorts to the top as though it were free.

**Honour `Idempotency-Key`.** Pricing is computationally idempotent but commercially metered. Replay
of the same key with an identical body should return the stored response; with a different body it
should be a `409`. This protects both sides when a network timeout triggers a client retry.

**Echo `X-Request-Id`.** When a consumer is asking several insurers about a quote from last Tuesday,
one shared token is the difference between an investigation and a guess.

## Troubleshooting

**`NullPointerException: Cannot invoke "java.util.Map.get(Object)" because "var.allowableValues" is
null`**

You are generating from a copy of the contract taken before this was fixed. Confirm with
[Am I on the current contract?](README.md#am-i-on-the-current-contract) and re-download — note that
`info.version` cannot tell you, since it reads `0.1.0` in both.

For the record, since it is a useful thing to recognise in your own specs: the cover discriminant
was originally pinned with `const`, which is correct JSON Schema. But openapi-generator resolves a
discriminator through each variant's *allowable values*, which only `enum` populates — so it aborted
and emitted nothing at all. A single-value `enum` is equivalent and works.

**Generation "succeeds" but the model directory is empty** — check the console for an `Exception`.
This tool writes progress lines to stdout and can fail late, so an absence of output files is the
reliable signal, not the exit status.

**Nothing generates and there is no error** — check you passed `-i` a bundled file. Generating from
`domains/quoting/openapi.yaml` requires its `$ref`s to be bundled first.

**`javax.*` imports against Spring Boot 3** — you omitted `useJakartaEe=true`.
