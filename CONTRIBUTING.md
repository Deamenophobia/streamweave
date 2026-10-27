# Contributing to Streamweave

Start with the [contributor guide](docs/wiki/contributing.md), [extension ownership map](docs/wiki/extension-guide.md), and [repository instructions](AGENTS.md).

Use Node.js 22.12+; Python-engine work also requires Python 3.12 and `npm run engine:setup`.

Before submitting changes, run `npm run format` and `npm run check`. For Python or numerical-contract changes, also run `npm run engine:check`. Verify affected UI workflows when changing interactions.

Keep numerical code, document handling, execution, and presentation separate. Validate external inputs once at the appropriate boundary, then use typed internal values. Add focused tests for meaningful behavior and regressions; avoid duplicating validation or testing library arithmetic.

Describe the concrete problem, resulting behavior, verification, and limitations in the merge request. Update affected documentation and the [changelog](CHANGELOG.md). The detailed guide remains the canonical source for commands, module registration, and wiki publishing.
