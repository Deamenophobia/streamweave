# Contributor guide

Read [AGENTS.md](../../AGENTS.md) before making changes. Keep mathematical code independent of React, browser APIs, network clients, storage, and wall-clock reads. Keep file I/O, edit history, worker execution, and presentation separate. Prefer named operations and early returns to deeply nested conditional logic.

Use [Extension ownership](extension-guide.md) to choose the implementation location before adding a feature or adapter. See [File formats and archiving](file-formats.md) before changing save/import behavior.

## Local verification

```sh
npm ci
npm run format
npm run check
npm run engine:setup   # Python 3.12; first run only
npm run engine:check   # Ruff, Mypy, numerical/parity/service behavior
npm run demo
npm run demo:pressure
npm audit
```

`check` verifies formatting, documentation links, source import boundaries/dependency cycles, strict TypeScript, behavioral/numerical tests, and both production builds. TypeScript rejects unused locals/parameters and missing returns. The dependency audit is a point-in-time package advisory check, not a security assessment.

After interaction changes, inspect the browser: import assets without creating modules; place and connect modules; change parameters; undo/redo; navigate the three views; save and restore. Record actual acceptance results in [Validation](../validation.md). Automated browser coverage is still a known gap.

## Add a module

1. Define the typed value contract and valid parameter ranges. Decide how nulls, units, availability times, and overflow behave.
2. Add deterministic mathematical operations in the core, independent of the UI.
3. Add a definition under `workbench/modules/` using `defineModule`: ports, parameter schema, help, and evaluator belong together. [Smooth](../../packages/core/src/workbench/modules/smooth.ts) is a small example. Defaults are derived from the schema; input/output and parameter contracts are checked by `runModule`.
4. Add its kind to [contracts.ts](../../packages/core/src/workbench/contracts.ts), register it in [registry.ts](../../packages/core/src/workbench/registry.ts), and choose an icon in [modulePresentation.ts](../../apps/workbench/src/modulePresentation.ts). The generic inspector renders existing field kinds automatically; the scheduler needs no module-specific branch. Use explicit units in labels; stored time parameters are milliseconds and `displayScale` describes their UI conversion.
5. Test independent analytical fixtures, missing/degenerate cases, graph composition, and portable project behavior. Do not merely restate the implementation in tests.
6. Update the [module reference](module-reference.md), [numerical contract](../analytics.md), and relevant example or tutorial.
7. Run `npm run contracts:generate`, implement/register the Python evaluator, and add a cross-engine fixture. See [Local Python engine](local-engine.md) for ownership and verification. Both engines must agree on the public data contract.

A data adapter should normalize timestamps, units, release/revision information, and bounds before the core receives a dataset. Network retrieval does not belong inside a calculation node.

This is a build-time extension contract. It does not load arbitrary remote plugins or scripts. A genuinely new parameter interaction should extend the shared field contract and renderer, with option-resolution tests; do not reintroduce a conditional chain keyed by module type. Keep low-level numerical kernels independently callable and validated.

## Edit transactions and asynchronous work

Keep project mutations immutable. A connected insertion or deletion with its incident wires must be one undo transaction. Canvas measurements and selection remain outside serialized projects. Graph positions must not trigger recalculation.

Engine changes cancel the previous run; Python checks cooperative cancellation between nodes and numerical chunks. File operations must not replace a newer document when an earlier read finishes late. The project-opening coordinator has explicit race tests; keep those invariants when changing file handling.

## Documentation and wiki publishing

Canonical sources are `docs/wiki/*.md`, `docs/architecture.md`, `docs/analytics.md`, `docs/validation.md`, and `docs/code-quality.md`. Screenshots are in `docs/`. Do not maintain a separately edited wiki copy: direct wiki edits can be overwritten by the next publish.

The publish preparation script checks local links, maps source links to GitLab, and copies only owned documentation files and images. It does not delete unrelated wiki pages or push changes.

```sh
# Clone once; .local is ignored by the application repository.
git clone git@gitlab.com:Deamenophobia/streamweave.wiki.git .local/wiki
npm run docs:check
npm run docs:wiki
git -C .local/wiki diff
git -C .local/wiki add -- .
git -C .local/wiki commit -m "Update Streamweave documentation"
git -C .local/wiki push origin HEAD
```

On an existing clone, pull its current branch before preparing files and inspect remote edits. Publish after the corresponding code/docs commit reaches the project repository. Check the GitLab-rendered Home page, sidebar, images, and representative internal links. Main-project CI validates documentation links; the wiki has a separate Git history and no application build pipeline.

## Test scope

Prefer tests for observable numerical behavior, cache invalidation, cancellation, external input rejection, and compatibility. Reuse shared fixtures instead of repeating the same validation assertion at each internal layer. Match timestamps and counts exactly; use justified tolerance for computed floating-point values. Avoid tests that merely mirror implementation steps or verify language/library arithmetic.

## Review standard

A review should state the concrete problem, resulting behavior, tests, and remaining limitations. Passing tests are necessary evidence, not proof of universal correctness. Avoid calling the project production-ready without browser, accessibility, performance, and deployment evidence appropriate to the intended use.
