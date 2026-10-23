# Contributor guide

Read [AGENTS.md](../../AGENTS.md) before making changes. Keep mathematical code independent of React, browser APIs, network clients, storage, and wall-clock reads. Keep file I/O, edit history, worker execution, and presentation separate. Prefer named operations and early returns to deeply nested conditional logic.

## Local verification

```sh
npm ci
npm run format
npm run check
npm run demo
npm run demo:pressure
npm audit
```

`check` verifies formatting, documentation links, strict TypeScript, behavioral/numerical tests, and both production builds. TypeScript rejects unused locals/parameters and missing returns. The dependency audit is a point-in-time package advisory check, not a security assessment.

After interaction changes, inspect the browser: import assets without creating modules; place and connect modules; change parameters; undo/redo; navigate the three views; save and restore. Record actual acceptance results in [Validation](../validation.md). Automated browser coverage is still a known gap.

## Add a module

1. Define the typed value contract and valid parameter ranges. Decide how nulls, units, availability times, and overflow behave.
2. Add deterministic mathematical operations in the core, independent of the UI.
3. Extend `WorkbenchKind`, `WORKBENCH_MODULES`, and evaluation in [workbench/graph.ts](../../packages/core/src/workbench/graph.ts).
4. Add inspector controls and its icon/detail in the workbench. Use explicit units in labels; project time parameters are milliseconds.
5. Test independent analytical fixtures, missing/degenerate cases, graph composition, and portable project behavior. Do not merely restate the implementation in tests.
6. Update the [module reference](module-reference.md), [numerical contract](../analytics.md), and relevant example or tutorial.

A data adapter should normalize timestamps, units, release/revision information, and bounds before the core receives a dataset. Network retrieval does not belong inside a calculation node.

## Edit transactions and asynchronous work

Keep project mutations immutable. A connected insertion or deletion with its incident wires must be one undo transaction. Canvas measurements and selection remain outside serialized projects. Graph positions must not trigger recalculation.

Worker changes cancel the previous worker. File operations must not replace a newer document when an earlier read finishes late. The project-opening coordinator has explicit race tests; keep those invariants when changing file handling.

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

## Review standard

A review should state the concrete problem, resulting behavior, tests, and remaining limitations. Passing tests are necessary evidence, not proof of universal correctness. Avoid calling the project production-ready without browser, accessibility, performance, and deployment evidence appropriate to the intended use.
