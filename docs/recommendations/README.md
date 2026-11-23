# Recommendations

Proposals put to the standard by the organisations implementing it, and the response to each.

A proposal changes the standard only through a pull request to the contracts. This directory is
the record of what was asked, what was decided and why, so the reasoning can be found later
without reading a pull request thread.

## Layout

```
docs/recommendations/<organisation>/<date>-<subject>/
    01-proposal.*     what was proposed
    02-response.md    what was adopted, changed or deferred, with the reasoning
    03-reply.md       the proposer's reply, and what came of it, where there is one
```

`<date>` is the date on the proposal, as `YYYY-MM-DD`. The number is the order to read in.

`<organisation>` is `anonymous` where the proposer has asked not to be named. The proposal is then
filed as a summary written by the maintainers, and the original is not filed.

## Index

| Date | From | Subject | Status |
|---|---|---|---|
| 2026-11-02 | Anonymous | [Occupation fields](anonymous/2026-11-02-occupation-fields/01-proposal.md) | Reply received. Accepted with one change, now in the contract |

## Rules for this directory

- **A named proposal is filed as received.** Do not edit it. Disagreement goes in the response.
- **Get the proposer's consent before filing, and ask whether they will be named.** This repository
  is public, and a proposal usually carries figures about the proposer's own book.
- **An anonymous proposal is filed as a summary.** Leave out the proposer's name, its people, its
  occupation wording and the exact sizes of its list, any of which can identify it. Keep the
  shapes proposed and the measured effect of each ask. The same goes for the response and any
  reply.
- **Naming a proposer who has consented is allowed here and nowhere else.** The provenance gate
  exempts this directory, and only this directory, apart from `anonymous/`, which it scans like
  any contract. See [`../PROVENANCE-RULES.md`](../PROVENANCE-RULES.md).
- **Adopt the idea, not the wording.** A change that follows from a proposal is written in the
  contracts from the adviser-facing concept. The proposer's strings, codes and band boundaries do
  not travel.
