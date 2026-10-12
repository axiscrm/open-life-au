# Changelog

## [0.2.0](https://github.com/axiscrm/open-life-au/compare/core-v0.1.0...core-v0.2.0) (2026-10-12)


### ⚠ BREAKING CHANGES

* **quoting:** `PremiumSet` no longer requires `weekly`, `fortnightly`, `quarterly` or `half_yearly`. A consumer that reads them unconditionally must handle their absence, and must not derive them. `WaitingPeriod` accepts eight new values, so an implementation mapping it exhaustively needs a row for each or an explicit refusal.
* **quoting:** `commission` is no longer accepted on a cover in a QuoteRequest. Requests carrying one are rejected rather than ignored; the basis is set once at policy level, and a per-cover difference is reported by the insurer.
* **quoting:** `commission` is required on a quote line where `all_needs_met` is true. A premium whose commission basis is unstated is not comparable, so this is required rather than optional.
* **quoting:** Percentage is now a decimal string ('25', not 25).

### Features

* add the Open Life quoting contract (AX-2793) ([1a0d3bb](https://github.com/axiscrm/open-life-au/commit/1a0d3bb1c955316aadcf407460abf052fc22f5c4))
* **contracts:** clear the deferred review findings in both contracts ([aacea40](https://github.com/axiscrm/open-life-au/commit/aacea4063d7476c4c13045b67e61bfaed858339a))
* **policy:** add the policy contract — snapshot pull, arrears, optional webhooks ([0e62097](https://github.com/axiscrm/open-life-au/commit/0e62097a301d47121801d976b762378edf7c630d))
* **policy:** hold the benefit detail an in-force book already carries ([#3](https://github.com/axiscrm/open-life-au/issues/3)) ([a5ba7cb](https://github.com/axiscrm/open-life-au/commit/a5ba7cbdc3081b29c2cf893cb6af6d9506b1b50a))
* **quoting:** close the gaps a real engine implementation found ([9673ae1](https://github.com/axiscrm/open-life-au/commit/9673ae1eabde1ab8cadc4e6001ea1c7e25121e2d))
* **quoting:** price on a stated commission basis, and round a derived benefit down ([d9d87b9](https://github.com/axiscrm/open-life-au/commit/d9d87b977efb53998d065616aa19b3119c8a9cb4))
* **quoting:** publish the commission ladder, and drop the per-cover basis ([8983105](https://github.com/axiscrm/open-life-au/commit/898310508b59d615126f7ccd5d1ffa6c6d5b97d7))
* **quoting:** quote the frequencies you sell, and state waiting periods in the product's own unit ([8068257](https://github.com/axiscrm/open-life-au/commit/8068257821bbe9c612ca188e32b33afdf2f9e977))


### Bug Fixes

* **contracts:** remove boolean schemas — openapi-python-client cannot parse them ([11de904](https://github.com/axiscrm/open-life-au/commit/11de9042c5c5c251cd7346c719e2c108fe302179))
