# open-life-au

## Before pushing
- Run `npm run verify`. It is what CI runs. `dist/` and `postman/` are generated and committed: rebuild them (`npm run bundle`, `npm run postman`) after any change under `core/` or `domains/`.

## Versions
A contract's version lives in `version.txt`, `info.version`, `.release-please-manifest.json`, the bundled `dist/`, and the root `README.md` (the contract table and any `<contract>-v<version>` tag it names). release-please updates all of them except the README, because one README line per contract can't be scoped to one package in release-please's generic updater.

- When a release PR (`chore: release main`) is open, or you change a version by hand, run `npm run versions:fix` and commit the README with it. `npm run versions` (part of `verify`) fails while the README lags.
- Never edit the version numbers in the README table by hand. Run the fix.
- Merging a release PR does not cut the tags. The Release workflow is manual (`workflow_dispatch`), so it has to be run after the merge, or the README names a tag that doesn't exist yet. Ask before running it.
