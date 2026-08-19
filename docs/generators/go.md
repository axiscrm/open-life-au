# Go

[`openapi-generator`](https://openapi-generator.tech/) for a client, and server stubs via
`go-server` (net/http) or `go-gin-server` (Gin).

Verified against **openapi-generator 7.24.0**.

## Prerequisites

A JDK 17+ and Node 20+ — openapi-generator is a Java tool distributed through npm, so you need both
even though the output is Go. And Go 1.21+ to build it.

```bash
java -version   # 17+
node -v         # 20+
go version      # 1.21+
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

## Generate the client

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g go -o ./openlifequoting \
  --additional-properties=packageName=openlifequoting,isGoSubmodule=true
```

`isGoSubmodule=true` omits the generated `go.mod`, which is what you want when generating into a
directory inside an existing module. Drop it if you want a standalone module.

## Generate server stubs

```bash
# net/http
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g go-server -o ./generated-server \
  --additional-properties=packageName=quoting,sourceFolder=api

# or Gin
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g go-gin-server -o ./generated-server \
  --additional-properties=packageName=quoting
```

`go-server` emits routers plus a service interface per tag. Implement `QuotesAPIServicer` and wire it
into the generated router; regenerating replaces the routing and leaves your service alone, which is
the same separation `interfaceOnly` gives on the JVM.

## Nuances worth knowing

**`Money.Amount` is a `string`, and this matters more in Go than anywhere else.**

Go has no decimal type in its standard library. There is no safe built-in to parse into — so if you
reach for `strconv.ParseFloat` you have silently reintroduced exactly the drift the contract's string
encoding exists to prevent. Use a decimal package:

```go
import "github.com/shopspring/decimal"

total, err := decimal.NewFromString(line.Premiums.Monthly.Total.Amount)
```

CI asserts on every change that `Money.Amount` is still generated as `string`.

**The cover union is a tagged struct, not an interface.** `CoverRequest` holds one non-nil pointer
per variant, with generated constructors and accessors:

```go
cover := openlifequoting.LifeCoverAsCoverRequest(&openlifequoting.LifeCover{
    CoverId:    "life-1",
    CoverType:  "life",
    SumInsured: money("1000000.00"),
})

// On the way back, switch on which pointer is populated:
if ip := received.IncomeProtectionCover; ip != nil {
    waitingPeriod := ip.WaitingPeriod
}
```

Slightly awkward compared to a sealed interface, but it round-trips correctly through the
discriminator, which is the part that matters.

**Optional fields are pointers.** `*string`, `*bool` and so on, so absent and zero stay
distinguishable. That is load-bearing here: in the loadings maps a benefit present with `0` means
"explicitly no loading" and an absent one means "no instruction", and collapsing the two changes the
request. Use the generated `GetX()` / `GetXOk()` accessors rather than dereferencing.

**Read the frequency you need; never divide.** Sub-annual premiums include a frequency loading, so
annual ÷ 12 is not the monthly premium. It will be noticeably low and nothing will look wrong.

`Premiums` carries `Monthly` and `Annual` always; the other four are pointers that are nil where the
insurer does not quote that frequency, and those are listed in `Premiums.NotQuoted`. Nil means the
frequency cannot be bought at any price, so dividing produces a figure that is both wrong and
unpurchasable — disable the control instead.

**A line with `AllNeedsMet == false` is not an offer.** `Premiums` is nil. Filter before sorting by
price, or a failed line sorts to the top as though it were free.

## Troubleshooting

**`go vet` complains about unused imports in generated files** — expected on some generator versions.
Run `goimports -w` over the output, or add the directory to your lint exclusions; it is generated
code and should not be hand-edited.

**Struct tags show escaped commas in the validate regex** — for example
`validate:"regexp=^-?\\d{1\\,12}..."`. That is the tag-encoding escape, not a broken pattern. It is
cosmetic unless you are actually running `go-playground/validator` against it.

**Anything else unexplained** — check you are on the current contract first; see
[Am I on the current contract?](README.md#am-i-on-the-current-contract).
