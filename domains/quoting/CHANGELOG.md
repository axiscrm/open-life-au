# Changelog

## [0.2.1](https://github.com/axiscrm/open-life-au/compare/quoting-v0.2.0...quoting-v0.2.1) (2026-10-15)


### Bug Fixes

* contract wording and CI follow-ups from the docs review ([#13](https://github.com/axiscrm/open-life-au/issues/13)) ([e4d1e94](https://github.com/axiscrm/open-life-au/commit/e4d1e94367e7b31a064e3933571b8a0cf399e80b))

## [0.2.0](https://github.com/axiscrm/open-life-au/compare/quoting-v0.1.0...quoting-v0.2.0) (2026-10-12)


### ⚠ BREAKING CHANGES

* **quoting:** `QuoteLine.research_scores`, the `ResearchScores` and `Score` schemas and the `features.research_scores` capability flag are removed. A research score is an opinion about a product, maintained by whoever publishes it, not something the insurer states about its own product. Removed without a deprecation period while pre-1.0; no implementation emitted it. See docs/migration/quoting-0.2.md.
* **quoting:** an unrecognised feature code is reported on the line as `unrecognised` rather than rejecting the request with 422.
* **quoting:** `PremiumSet` no longer requires `weekly`, `fortnightly`, `quarterly` or `half_yearly`. A consumer that reads them unconditionally must handle their absence, and must not derive them. `WaitingPeriod` accepts eight new values, so an implementation mapping it exhaustively needs a row for each or an explicit refusal.
* **quoting:** `commission` is no longer accepted on a cover in a QuoteRequest. Requests carrying one are rejected rather than ignored; the basis is set once at policy level, and a per-cover difference is reported by the insurer.
* **quoting:** `commission` is required on a quote line where `all_needs_met` is true. A premium whose commission basis is unstated is not comparable, so this is required rather than optional.
* **quoting:** annual_income is required on the insured when income protection or business expenses is requested.
* **quoting:** Percentage is now a decimal string ('25', not 25).

### Features

* add the Open Life quoting contract (AX-2793) ([1a0d3bb](https://github.com/axiscrm/open-life-au/commit/1a0d3bb1c955316aadcf407460abf052fc22f5c4))
* **contracts:** clear the deferred review findings in both contracts ([aacea40](https://github.com/axiscrm/open-life-au/commit/aacea4063d7476c4c13045b67e61bfaed858339a))
* **policy:** add the policy contract — snapshot pull, arrears, optional webhooks ([0e62097](https://github.com/axiscrm/open-life-au/commit/0e62097a301d47121801d976b762378edf7c630d))
* **quoting:** `available` feature status for sources that cannot tell built-in from optional ([1c5b713](https://github.com/axiscrm/open-life-au/commit/1c5b7136dba0951c765653285fa4330f4f9c9322))
* **quoting:** close the gaps a real engine implementation found ([9673ae1](https://github.com/axiscrm/open-life-au/commit/9673ae1eabde1ab8cadc4e6001ea1c7e25121e2d))
* **quoting:** give required features a portable vocabulary ([bbcb6b1](https://github.com/axiscrm/open-life-au/commit/bbcb6b10d7778e9772c2e4404c843fdd1e4de1a1))
* **quoting:** minimum premium, PDS editions and per-line features; remove research scores ([6229368](https://github.com/axiscrm/open-life-au/commit/6229368ac411e912849cbe6b29c1563e38ed863e))
* **quoting:** price on a stated commission basis, and round a derived benefit down ([d9d87b9](https://github.com/axiscrm/open-life-au/commit/d9d87b977efb53998d065616aa19b3119c8a9cb4))
* **quoting:** product selection — insurer_products, published products, the product a cover was written on ([f7f89ce](https://github.com/axiscrm/open-life-au/commit/f7f89ce59a2576668cd7b01b5ed8d36171221bf2))
* **quoting:** product selection — insurer_products, published products, the product a cover was written on ([77e7a88](https://github.com/axiscrm/open-life-au/commit/77e7a88ea7e42cbc0cec5a668849233f90133bf3))
* **quoting:** publish the commission ladder, and drop the per-cover basis ([8983105](https://github.com/axiscrm/open-life-au/commit/898310508b59d615126f7ccd5d1ffa6c6d5b97d7))
* **quoting:** quote the frequencies you sell, and state waiting periods in the product's own unit ([8068257](https://github.com/axiscrm/open-life-au/commit/8068257821bbe9c612ca188e32b33afdf2f9e977))
* **quoting:** state the combinations no insurer can write ([dfeaec7](https://github.com/axiscrm/open-life-au/commit/dfeaec7374c768cfc849d7c170b7d5f2533187dc))


### Bug Fixes

* **contracts:** close the defects an adversarial review found in both contracts ([b04a892](https://github.com/axiscrm/open-life-au/commit/b04a89295873f2b85504c35532a3031ef170102a))
* **contracts:** remove boolean schemas — openapi-python-client cannot parse them ([11de904](https://github.com/axiscrm/open-life-au/commit/11de9042c5c5c251cd7346c719e2c108fe302179))
* **quoting:** keep the declared feature's code and name required ([ae25de0](https://github.com/axiscrm/open-life-au/commit/ae25de0538ee4a7d9d7130de93f35d8dfe123571))
* **quoting:** make the cover discriminant generator-portable, and prove it in CI ([f9e0385](https://github.com/axiscrm/open-life-au/commit/f9e0385f66d1f7d2197dfe9e00a134d8d00b982a))
* **quoting:** raise the per-cover products ceiling from 100 to 1000 ([98abfa3](https://github.com/axiscrm/open-life-au/commit/98abfa3ee3d4911c6f96ad469b3c9afe837fe97e))
* **quoting:** raise the per-cover products ceiling from 100 to 1000 ([98cca8d](https://github.com/axiscrm/open-life-au/commit/98cca8d7b4bb6a2a5669e7555e15907d96f24c1e))
* **quoting:** stop a generator silently dropping three of the seven covers ([51c582a](https://github.com/axiscrm/open-life-au/commit/51c582ad38bc0a2b8eca3a86752d825b124030b1))
