# Ruby

[`openapi-generator`](https://openapi-generator.tech/) for a client gem.

**Client only, and that is a real limitation.** `ruby-sinatra` and `ruby-on-rails` exist as server
generators, but `ruby-sinatra` emits a 13-file scaffold with **no models at all** — just route stubs.
For a contract whose whole value is its typed cover schemas, that is not a useful starting point. If
you are implementing the server side in Ruby, generate the client gem for its models and wire your
own routes; the models are the part worth having.

Verified against **openapi-generator 7.24.0**.

## Prerequisites

A JDK 17+ and Node 20+ — openapi-generator is a Java tool distributed through npm, so you need both
even though the output is Ruby. And Ruby 3.0+ to run it.

```bash
java -version   # 17+
node -v         # 20+
ruby -v         # 3.0+
```

## Get the contract

`dist/quoting/openapi.yaml` is self-contained — every `$ref` already resolved — so this one file is
all you need.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.yaml
```

## Generate

```bash
npx @openapitools/openapi-generator-cli@2 generate \
  -i openapi.yaml -g ruby -o ./openlife_quoting \
  --additional-properties=gemName=openlife_quoting,moduleName=OpenLifeQuoting
```

A complete gem: `lib/openlife_quoting/models/` with one file per schema, `api/` with a class per tag,
plus a gemspec. The default HTTP library is Faraday; `library=typhoeus` is the alternative.

```ruby
require 'openlife_quoting'

OpenLifeQuoting.configure do |config|
  config.host = 'api.example.com.au'
  config.base_path = '/openlife/quoting/v1'
  config.access_token = access_token
end

api = OpenLifeQuoting::QuotesApi.new
response = api.create_quote(quote_request, idempotency_key: SecureRandom.uuid)
```

There is also `ruby-nextgen`, a newer template with a different internal structure. It is less widely
used; the plain `ruby` generator is the one exercised in CI here.

## Nuances worth knowing

**`Money#amount` is a `String`. Convert with `BigDecimal`, never `to_f`.**

```ruby
require 'bigdecimal'
require 'bigdecimal/util'

total = line.premiums.monthly.total.amount.to_d   # String#to_d, from bigdecimal/util
```

`to_f` gives you a Float and reintroduces exactly the drift the string encoding exists to prevent.
Ruby's `to_d` is a clean conversion, so this is the least painful of any language here — as long as
you remember to require `bigdecimal/util`.

**The cover union is handled at runtime.** `CoverRequest` implements `openapi_one_of` and
`openapi_discriminator_name`, so `build_from_hash` dispatches on `cover_type` and returns the right
variant class:

```ruby
cover = OpenLifeQuoting::CoverRequest.build_from_hash(payload)
case cover
when OpenLifeQuoting::IncomeProtectionCover
  cover.waiting_period    # only exists here
end
```

Because this is runtime rather than compile-time, nothing catches a wrong option until the request is
built. Validate before sending — the models raise on unknown enum values, which is your equivalent of
the compile error other languages get.

**Read the frequency you need; never divide.** `premiums` carries all six, and sub-annual premiums
include a frequency loading, so annual ÷ 12 is not the monthly premium. It will be noticeably low and
nothing will look wrong.

**A line with `all_needs_met == false` is not an offer.** `premiums` is nil. Filter before sorting by
price, or a failed line sorts to the top as though it were free.

## Troubleshooting

**`ruby-sinatra` produced almost nothing** — expected; see the note at the top. It generates routes
without models. Use the client gem's models and write your own routes.

**Model files not found after generating** — check `gemName`. The path is
`lib/<gemName>/models/`, so a different `gemName` moves everything.

**Anything else unexplained** — check you are on the current contract first; see
[Am I on the current contract?](README.md#am-i-on-the-current-contract).
