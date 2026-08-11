# Postman collections

Ready-to-send collections for every contract, so you can see the shapes in practice before writing
any code.

| Collection | Contract | Requests | Mock port |
|---|---|---|---|
| [`quoting.postman_collection.json`](quoting.postman_collection.json) | [quoting](../domains/quoting/) | 4 | 4010 |
| [`policy.postman_collection.json`](policy.postman_collection.json) | [policy](../domains/policy/) | 4 | 4011 |
| [`requirements.postman_collection.json`](requirements.postman_collection.json) | [requirements](../domains/requirements/) | 3 | 4012 |

<details>
<summary>What is in each</summary>

**Quoting** — `POST /quotes` (body: life cover with a linked TPD rider, held in super) ·
`GET /capabilities` · `GET /occupations` · `POST /occupations:match`

**Policy** — `GET /policies` (the book snapshot) · `GET /policies/{policy_id}` ·
`GET /arrears` (the dishonour worklist) · `GET /capabilities`

**Requirements** — `GET /cases` (everything outstanding) · `GET /cases/{case_id}` ·
`GET /capabilities`

</details>

> **Generated, not hand-maintained.** `npm run postman` rebuilds all three from `dist/`, and CI fails
> if what is committed differs from what the contracts produce. Edits made here will be overwritten —
> change the contract instead.

## Setup

1. **Import.** In Postman: *Import* → *File* → choose one or more `*.postman_collection.json`. Or
   paste a raw URL:

   ```
   https://raw.githubusercontent.com/axiscrm/open-life-au/main/postman/policy.postman_collection.json
   ```

2. **Set two collection variables** per collection. Select it → *Variables*:

   | Variable | Set it to |
   |---|---|
   | `baseUrl` | The implementation you are calling. Defaults to that contract's local mock |
   | `accessToken` | An OAuth2 client-credentials access token. The mock accepts any non-empty value |

   Set the **Current value** column, not just Initial value — Postman only sends the current one, and
   an unset current value sends an empty string rather than falling back. A token that looks correct
   in the table but produces `401` on every request is almost always this.

3. **Send.** Collection-level auth is already `Bearer {{accessToken}}` and every request inherits it.

Requests with a path parameter — `GET /policies/{policy_id}`, `GET /cases/{case_id}` — arrive with a
worked example already filled in under the request's *Path Variables*, so they can be sent as-is
against the mock and edited for a real implementation.

## Running against the mock

You do not need an insurer endpoint to try any of this:

```bash
npm ci
npm run bundle
npm run mock                  # all three contracts at once
npm run mock:policy           # or just one
```

Each collection's default `baseUrl` already points at the right port. Set `accessToken` to any
non-empty string and send.

The addresses are `127.0.0.1`, not `localhost`, and that is deliberate: Prism binds IPv4 only, so on
a machine where `localhost` resolves to `::1` first every request fails to connect for reasons that
have nothing to do with the contract.

The mock returns contract-shaped examples rather than real data, so it answers "what does a response
look like, and will my client parse it" — not "is this premium right" or "whose bloods are
outstanding". That is the question worth answering first: most integration problems are shape
problems.

## Running against an insurer

Change `baseUrl` to their base URL and put a real token in `accessToken`. The contracts specify
OAuth 2.0 client credentials (RFC 6749, section 4.4), machine-to-machine — so you exchange a client
id and secret for a token at the insurer's token endpoint and paste the result in. Postman's
*Authorization* tab can do that exchange for you if you prefer: set the collection auth to
*OAuth 2.0*, grant type *Client Credentials*, and Postman will manage the token instead of the
`accessToken` variable.

Expect differences between implementations, and read `GET /capabilities` before concluding anything
is broken. A partial implementation is a conformant one — and on the policy and requirements
contracts, `capabilities` is also what distinguishes "this record has no such value" from "this
insurer never reports one", which look identical in the data and mean very different things.

**Before sending a paged request at a real implementation**, read the description on `GET /policies`,
`GET /arrears` or `GET /cases` in the collection. All three are snapshots whose absence semantics are
only safe once a complete walk has finished, and the collection carries the full rule on each
request rather than assuming you have read the reference.

## Why the bodies are trustworthy

Where an operation takes a body, it is not generated from the schema — it is the contract's own
worked example, validated by `npm run examples` and **posted at a live mock in CI** by
`npm run mock:check`, which drives every request in these collections and fails the build on any
non-200. They are known to be accepted.

This matters because the obvious alternative produces bodies that are not. Generating a collection
from OpenAPI with `openapi-to-postmanv2` invented `"osca": 978.5166502170916` for a string field
carrying a pattern, and a sum insured of `"<Error: Too many levels of nesting to fake this schema>"`.
A collection is the first thing someone evaluating a contract actually runs, and handing them a body
that would be rejected is worse than handing them nothing. See the header of
[`scripts/build-postman.mjs`](../scripts/build-postman.mjs).

## If something does not work

If a request in these collections is rejected by a conformant implementation, that is a defect in the
contract or in the generator — ours either way. Please
[open an issue](https://github.com/axiscrm/open-life-au/issues).
