# Rust

[`openapi-generator`](https://openapi-generator.tech/) `rust-axum` for server stubs: an async trait
per tag to implement, and an [axum](https://github.com/tokio-rs/axum) router that calls it — with a
small script either side of the generator, because without it three of the four crates do not compile
and the fourth puts the wrong value on the wire.

Verified against **openapi-generator 7.24.0**, generating **axum 0.8** crates on **edition 2024**.

## Prerequisites

A JDK 17+ and Node 20+ — openapi-generator is a Java tool distributed through npm, so you need both
even though the output is Rust. Node also runs the fix-up script. And Rust 1.85+ to build it, which
edition 2024 requires.

```bash
java -version   # 17+
node -v         # 20+
cargo --version # 1.85+
```

## Get the contract and the fix-up script

Use the **JSON** bundle — the script reads it with nothing but Node. Every `$ref` is already resolved,
so these two files are all you need. You do not need to clone this repository.

```bash
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/dist/quoting/openapi.json
curl -O https://raw.githubusercontent.com/axiscrm/open-life-au/main/scripts/rust-axum.mjs
```

Generate each contract as its own crate. Every command below shows quoting; substitute `policy`,
`requirements` or `commissions` in the URL and the package name for the others. See
[policy.md](policy.md) for what differs once a contract returns a paged snapshot.

## Generate the server

Three steps, and all three are required:

```bash
node rust-axum.mjs prepare openapi.json > stubs.json

npx @openapitools/openapi-generator-cli@2 generate \
  -i stubs.json -g rust-axum -o ./openlife_quoting \
  --additional-properties=packageName=openlife_quoting

node rust-axum.mjs patch openapi.json ./openlife_quoting
```

Re-run all three whenever you regenerate. CI runs exactly these steps for every contract, compiles
the result, and pushes every worked example through the generated models and validators.

**What `prepare` does** — drops the `webhooks` and the `webhookSignature` scheme only they use, and
spells out the `type` on two `allOf` overrides that narrow a property without restating it. The
contract means the same thing afterwards. Without it, the webhooks become a trait with no name
(`pub trait <E: …>`), the signature scheme an unbound `Claims = C`, and the arrears amount an untyped
`types::Object` with a regex attached — none of which compiles. Nothing is lost by dropping the
webhooks: an insurer *sends* them, so they have no place in its server.

**What `patch` does** — repairs `src/models.rs`:

- **Cover discriminants.** Each cover defaults `cover_type` to its *schema* name — `"LifeCover"`, not
  `"life"`. This one is silent: requests deserialise, the router answers, and your implementation sees
  a value the contract does not allow and writes it back out. The script rewrites each default from the
  contract's own discriminator mapping.
- **Regex literals.** Patterns reach the Rust source through an HTML-escaping template, so `'` and
  `"` arrive as `&#39;` and `&quot;`, and one arrives with its backslashes unescaped. Every literal is
  decoded and re-emitted as a raw string.
- **Lookahead.** The `regex` crate does not support lookaround at all. Policy's "amount greater than
  zero" pattern uses one, so it is replaced with an exact equivalent. A lookaround the script does not
  recognise fails the script rather than panicking your server on first use.

## Implement it

You get one trait per tag — `Quotes`, `Discovery`, `Occupations` for quoting — plus an
`ErrorHandler` with a default `500`. Implement all of them on one type and hand it to the generated
router:

```rust
use async_trait::async_trait;
use axum_extra::extract::CookieJar;
use headers::Host;
use http::Method;
use openlife_quoting::{apis, models};

#[derive(Clone)]
struct Insurer { /* your rating engine */ }

impl AsRef<Insurer> for Insurer {
    fn as_ref(&self) -> &Insurer { self }
}

impl apis::ErrorHandler for Insurer {}

#[async_trait]
impl apis::quotes::Quotes for Insurer {
    async fn create_quote(
        &self,
        _method: &Method,
        _host: &Host,
        _cookies: &CookieJar,
        headers: &models::CreateQuoteHeaderParams,
        body: &models::QuoteRequest,
    ) -> Result<apis::quotes::CreateQuoteResponse, ()> {
        for cover in &body.covers {
            match cover {
                models::CoverRequest::IncomeProtectionCover(ip) => { /* ip.waiting_period, … */ }
                models::CoverRequest::LifeCover(life) => { /* … */ }
                _ => { /* … */ }
            }
        }
        todo!("price it")
    }
}

// … and apis::discovery::Discovery, apis::occupations::Occupations

let app: axum::Router = openlife_quoting::server::new(Insurer { /* … */ });
```

Responses are an enum per operation, one variant per documented status, carrying the headers that
status requires — `Status200_TheQuoteWasProduced { body, cache_control, x_request_id, .. }` and so
on — so the compiler holds you to the response headers as well as the body.

Regeneration replaces the router and models and leaves your implementation alone, which is the same
separation `interfaceOnly` gives on the JVM.

## Nuances worth knowing

**`Money.amount` is a `String`. Parse it into a decimal, never `f64`.**

```rust
use rust_decimal::Decimal;

let amount: Decimal = money.amount.parse()?;
```

CI asserts on every change that `Money.amount` is still generated as `String`.

**The router answers malformed requests itself, and not in the contract's shape.** A body that
does not deserialise gets axum's `422`; one that fails the generated validators gets a `400` with a
plain-text message. Neither is the `application/problem+json` `invalid-request` the contract
specifies, and your trait method never runs. If you are running the conformance suite, wrap the
router in a layer that rewrites those responses.

**Numbers the schema types as `number` come back as `f64`.** An occupation qualifier sent as `40`
re-serialises as `40.0`. Numerically identical, and the contract allows either — but a consumer that
compares bodies textually will see a difference.

**Timestamps come back in UTC.** `quoted_at: "2026-08-19T11:15:42+10:00"` is held as a
`DateTime<Utc>` and serialised as `"2026-08-19T01:15:42Z"`. Same instant, and `Z` satisfies the
contract's "RFC 3339 with an explicit offset" — but the AEST offset is gone.

**`\d` in Rust's `regex` is Unicode-aware.** The generated validators accept digits from other
scripts that the contract's ECMA-262 patterns reject. Harmless in practice — `.parse()` on the value
then fails — but do not treat a passing validator as proof a string is ASCII.

**Read the frequency you need; never divide.** Sub-annual premiums include a frequency loading, so
annual ÷ 12 is not the monthly premium. A frequency the insurer does not quote is `None` and listed
in `not_quoted`.

**A line with `all_needs_met == false` is not an offer.** `premiums` is `None`. Never price what you
could not assemble.

**Honour `Idempotency-Key`.** It arrives as `headers.idempotency_key: Option<Uuid>`. Replay of the
same key with an identical body should return the stored response; a different body should be a
`409`.

**Webhook payloads are not generated.** `prepare` removes them, so if you are an insurer sending
policy, requirements or commissions webhooks, model the payload from the contract's `webhooks` block
yourself.

## Clients

There is no documented Rust client, because the obvious one is broken. openapi-generator's `-g rust`
wraps the covers in a `#[serde(tag = "cover_type")]` enum **and** keeps `cover_type` as a required
field of each variant. Serde consumes the tag before the variant sees it, so **every one of the
quoting request examples fails** with ``missing field `cover_type` ``, and serialising writes the key
twice. It exits `0` with 88 healthy-looking files.

If you need typed requests and responses from Rust, depend on the crate above with the server
switched off and send them with whatever HTTP client you already use. The models compile on their
own, and they are the ones CI round-trips:

```toml
openlife_quoting = { path = "openlife_quoting", default-features = false }
```

## Troubleshooting

**`unknown character escape`, `pub trait <E` or `cannot find type C`** — `prepare` or `patch` did
not run. See [Generate the server](#generate-the-server).

**Every `cover_type` is `"LifeCover"`, `"TpdCover"`…** — `patch` did not run, or you regenerated
since.

**`rust-axum.mjs` fails with "expected N variant defaults" or "lookaround … with no known
equivalent"** — the generator's output or the contract has moved on from what the script knows. That
is deliberate: it stops rather than hand you a crate that is quietly wrong. Check you have the
current script, then open an issue.

**`Cargo.toml`'s `description` is the whole contract introduction** — cosmetic. The generator copies
`info.description` verbatim; overwrite it if you publish the crate.

**Anything else unexplained** — check you are on the current contract first; see
[Am I on the current contract?](README.md#am-i-on-the-current-contract).
