# Quoting contract

Pricing Australian life risk cover directly from an insurer. Draft, open for comment; the current version is in
[`version.txt`](version.txt). Changes: [`CHANGELOG.md`](CHANGELOG.md).

- Contract: [`openapi.yaml`](openapi.yaml) · bundled at [`dist/quoting/openapi.yaml`](../../dist/quoting/openapi.yaml)
- Worked requests and responses: [`examples/`](examples/README.md)
- Generating and consuming it: [`docs/generators/`](../../docs/generators/README.md)

## Why this contract exists

Adviser software that compares insurers today needs one integration per insurer, or an aggregator in
between. This is one shape an insurer can implement so that any consumer can price it without either.

## Shape

Four operations:

- `POST /quotes` prices a set of covers for one insured.
- `GET /capabilities` declares what the insurer supports, so a consumer can prevent an unsupported
  combination rather than have it rejected.
- `GET /occupations` searches the insurer's own occupation list, by name with `?q=`.
- `POST /occupations:match` resolves a baseline ABS OSCA reference to the insurer's own occupations.
  It matches on codes and qualifiers only, never on the description.

The request follows the questions an adviser answers, in order: who is insured, the answers that
apply to the whole policy, then one section per benefit. It is not modelled on any engine's wire
format.

## The rules that matter most

The five rules in the contract's `info.description` guard against failures that are silent: a
plausible number rather than an error. In short: return every frequency quoted, as the insurer prices it,
never price what could not be assembled, report every option not applied, echo what was rated, and
say which commission basis was priced. Read them in [`openapi.yaml`](openapi.yaml) before
implementing.

## Conformance

An implementation need not offer every cover or option. Declare what you offer in
`GET /capabilities`; you are held to that declaration. Several rules cannot be expressed in JSON
Schema (linked-cover amounts, explicit zero loadings, the premium arithmetic). The schema states them
normatively, and an implementation must test them itself.

## Privacy

The request carries no name, contact details or health data, and `Insured` is a closed schema. A
consumer sends the same client to several insurers, so every field it carries is collected several
times over.
