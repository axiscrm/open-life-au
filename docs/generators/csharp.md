# C# / .NET

[`openapi-generator`](https://openapi-generator.tech/) for both sides: ASP.NET Core controllers to
implement, and a client.

Verified against **openapi-generator 7.24.0**, targeting **.NET 8**.

## Prerequisites

A JDK 17+ and Node 20+ — openapi-generator is a Java tool distributed through npm, so you need both
even though the output is C#. And the .NET 8 SDK to build what comes out.

```bash
java -version     # 17+
node -v           # 20+
dotnet --version  # 8+
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

## Generate the server

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g aspnetcore -o ./generated-server \
  --additional-properties=packageName=OpenLife.Quoting,aspnetCoreVersion=8.0,operationIsAsync=true
```

`operationIsAsync=true` gives you `Task<IActionResult>` signatures rather than synchronous ones —
worth setting up front, because pricing is an I/O-bound call into a rating engine and retrofitting
async through a controller layer later is tedious.

You get abstract controllers with the routing, model binding and validation attributes already
applied. Implement by overriding:

```csharp
[ApiController]
public class QuotingController : QuotesApiController
{
    private readonly IPricingEngine _engine;

    public override async Task<IActionResult> CreateQuote(
        [FromBody] QuoteRequest quoteRequest,
        [FromHeader(Name = "Idempotency-Key")] Guid? idempotencyKey,
        [FromHeader(Name = "X-Request-Id")] string? xRequestId)
    {
        return Ok(await _engine.PriceAsync(quoteRequest));
    }
}
```

## Generate the client

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g csharp -o ./generated-client \
  --additional-properties=packageName=OpenLife.Quoting,targetFramework=net8.0
```

The default library is `restsharp`. For `HttpClient` instead — usually what you want inside an
ASP.NET application, so it participates in `IHttpClientFactory`, Polly and your existing telemetry —
add `library=httpclient`.

## Nuances worth knowing

**`Money.Amount` is a `string`. Parse to `decimal`, never `double`.**

```csharp
var total = decimal.Parse(
    line.Premiums.Monthly.Total.Amount,
    NumberStyles.Number,
    CultureInfo.InvariantCulture);
```

Pass `CultureInfo.InvariantCulture` explicitly. The contract's decimal separator is always `.`, and
a server running under a locale that uses `,` will otherwise parse `"1000.50"` as one million and
fifty. That is a genuinely nasty class of bug because it only appears on some machines. CI asserts
on every change that `Money.Amount` is still generated as `string`.

**The cover union deserialises properly.** `CoverRequest` gets a generated
`CoverRequestJsonConverter` that reads `cover_type` and dispatches to the right variant, so pattern
matching over the seven covers works:

```csharp
foreach (var cover in request.Covers)
{
    if (cover.ActualInstance is IncomeProtectionCover ip)
    {
        var waitingPeriod = ip.WaitingPeriod;   // only exists here
    }
}
```

**Read the frequency you need; never divide.** Sub-annual premiums include a frequency loading, so
annual ÷ 12 is not the monthly premium. It will be noticeably low and nothing will look wrong.

`Premiums` carries `Monthly` and `Annual` always; the other four are null where the insurer does not
quote that frequency, and those are listed in `Premiums.NotQuoted`. Null means the frequency cannot be
bought at any price, so dividing produces a figure that is both wrong and unpurchasable — disable the
control instead.

**A line with `AllNeedsMet == false` is not an offer.** `Premiums` is null. Filter before sorting by
price, or a failed line sorts to the top as though it were free.

**Honour `Idempotency-Key`.** Pricing is computationally idempotent but commercially metered. Replay
of the same key with an identical body should return the stored response; a different body should be
a `409`.

## Troubleshooting

**Nullable reference type warnings everywhere** — the generator targets a nullable-enabled project.
Either enable `<Nullable>enable</Nullable>` in your `.csproj`, or pass
`nullableReferenceTypes=false`.

**`System.Text.Json` versus `Newtonsoft`** — the C# generators default to `System.Text.Json` on
recent versions. If your codebase standardises on Newtonsoft, pass
`serializationLibrary=NewtonsoftJson` so the discriminator converter is emitted for the right
serialiser; mixing them will deserialise the cover union to null without an obvious error.

**Anything else unexplained** — check you are on the current contract first; see
[Am I on the current contract?](README.md#am-i-on-the-current-contract).
