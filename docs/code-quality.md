# Code quality review — updated 2026-10-28

## Assessment

The project is a reasonable foundation for a bounded local numerical workbench. The core is independent of browser/network services; edit history, file I/O, worker execution, navigation, and result presentation have separate owners. Strict types and deterministic tests provide useful checks. This assessment is scoped to the current implementation and the review below; it is not a blanket production-readiness claim or an independent external audit.

## Review scope and fixes

The review inspected import/project validation, numerical statistics and overflow, graph connection/execution rules, history operations, asynchronous file reads, worker ownership, and view boundaries. It also checked TypeScript strictness, suspicious suppression markers, dependency advisories, and documentation against code.

| Finding                                                                                   | Change                                                                               | Evidence                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| A large file selection was fully parsed before workspace count limits were applied        | Reject more than 12 files before reading; stop a batch once total rows exceed 50,000 | A counted file fixture proves rejected files are not read unnecessarily          |
| Connection checks could allow a 121st wire, leaving the graph globally invalid            | Reject at connection validation, shared by manual wiring and connected insertion     | A valid 120-wire graph remains valid and the next edit is rejected               |
| Extreme derived values could overflow moments and produce a misleading finite correlation | Reject non-finite means/covariance sums with an explicit rescaling error             | Independent extreme-value fixtures for correlation and linear fit                |
| A slow project-open read could replace a newer workspace or later open request            | Accept only the latest request for the document version it started from              | Deferred-promise tests cover replacement, out-of-order reads, and stale failures |

TypeScript additionally enforces unused-local, unused-parameter, and implicit-return checks. Documentation links are checked locally and in CI. Existing numerical behavior remains covered by analytical fixtures and graph tests.

## Verification

The TypeScript suite contains **62 tests**: the preceding 60 tests plus two local-engine response/provenance tests. The Python suite contains **19 focused tests**, covering nine shared projects, cache/resource behavior, an independent regression contract, adversarial rolling-window transitions and overflow, service reuse/isolation/cancellation/idle cleanup, and source dependencies. Redundant lower-level validation cases and a trivial pre-execution cancellation test were removed in favor of service-boundary and real-kernel workflow coverage. `npm run check` runs formatting, documentation-link and shared-contract validation, source boundary/cycle checks, type checking, TypeScript tests, and production builds. `npm run engine:check` adds Ruff, Mypy across all engine source files, and the Python tests. Both terminal examples were exercised during the original review.

`npm audit` reported **zero known vulnerabilities** for the installed JavaScript lockfile on 2026-10-28. This is time-sensitive and does not cover application logic or unknown vulnerabilities. React Flow still produces its known non-fatal `use client` bundler warning in this client application.

See the [validation record](validation.md) for browser acceptance evidence and the project's [GitHub checks](https://github.com/Deamenophobia/streamweave/actions/workflows/checks.yml) for checks tied to each pushed commit.

## Modularity and maintainability follow-up

The former core graph file combined metadata, module dispatch, validation, scheduling, and project parsing. Those responsibilities now have separate modules. Each built-in definition owns its ports, parameter schema, defaults, help, and evaluator. `registry.ts` is their composition point; `executor.ts` schedules modules through the shared contract without a module-type conditional chain. `graph.ts` remains a compatibility facade.

The inspector's module-specific conditions were replaced by shared parameter controls. Choice options, numeric limits, dependent maximums, time-unit conversions, and field visibility come from the definitions. Column controls resolve their declared dataset/input port. UI icon/detail presentation is separate from graph-edit operations.

The two bundled projects and all their calculation results were compared before/after and remained structurally identical. Added tests cover an independently defined module, port/finite-output guards, schema defaults and dependent bounds, and data-dependent column choices. Import-boundary and cycle checks run in CI. The extension guide shows how to add a module without modifying the scheduler or generic inspector.

## Extension and persistence boundaries — 2026-10-26

The former `projectFiles.ts` combined codecs, browser I/O, local storage, ID generation, and dataset updates. Those now have separate owners in `adapters/`, `platform/`, and `documents/`. Execution owns its request/response contract and lifecycle in `execution/`; views import the status contract without depending on the lifecycle hook. The dataset feature has focused import, summary, and schema components. Import checks enforce dependency directions for these layers as well as the core boundary and source cycles.

Project naming no longer invalidates calculations. Node titles remain dependencies because current output labels and error diagnostics use them. Native v2 project structure is unchanged. A shared core validator now checks in-memory projects before JSON serialization, preventing non-finite source values from being silently written as null. File adapters use UTF-8 byte limits.

Seven added tests cover portable projects and matching serialized results for both examples, invalid values/versions, dataset reader equivalence, and calculation dependencies. A production-build browser check covered dataset preview/schema, CSV export/import, project download/open, browser save/reload, and ready results without browser warning/error logs. See [extension ownership](wiki/extension-guide.md), [file formats](wiki/file-formats.md), and the [validation record](validation.md).

## Appearance boundaries — 2026-10-27

Classic and Studio share one component tree. The appearance feature owns its catalogue, selector, provider, and scoped CSS; the platform layer owns browser persistence and document attributes. Theme changes do not enter document history or calculation state. Three focused tests cover defaults, invalid saved values, preference persistence separate from project storage, and blocked/quota-limited storage. Production-build browser checks cover both appearances, reload persistence, graph/viewport preservation, and narrow layouts. This is manual visual acceptance, not a complete accessibility or cross-browser audit.

## Backend hardening — 2026-10-28

The engine now uses typed internal values and job states with static checking. Input datasets are validated and prepared once per upload; graph edits reuse those objects and their hashes. The scheduler trusts built-in evaluator types and previously checked graph ports instead of repeating internal shape checks. External JSON, graph structure/parameters, numerical domain conditions, and finite serialization remain explicit boundaries.

Protocol 2 separates input upload, lightweight progress, and completed results. The client retains one decoded result and the server returns changed output payloads; cached rows are not transferred or revalidated. A source table reuses the browser's uploaded dataset. Periodic cleanup removes idle results/sessions, cancellation is checked in numerical loops, and failures have stable codes. Worker threads still use cooperative deadlines; native calls are not forcibly killed.

Rolling statistics use incremental centered moments and monotonic queues. Periodic rebuilding bounds drift; the origin also resets when its magnitude dwarfs the remaining window. Explicit constant-window detection prevents roundoff from creating a spurious correlation. One adversarial batch-reference study exercises large offsets, small variation, changes in scale, constant stretches, missing runs, and availability times. A regression check prevents overflowing variance from being clamped into a valid zero. Cache retention is bounded by encoded size and conservative Python-object size; actual service RSS is measured separately.

## Remaining gaps

The Python engine keeps HTTP, jobs, cache, graph validation/scheduling, and numerical modules separate. Generated metadata avoids two independently maintained port/parameter catalogues. Cancellation suppresses stale results, and service failure remains visible without silent fallback. Parity fixtures and an explicit engine/library provenance record support reproducibility. See [Local Python engine](wiki/local-engine.md) for limits and extension locations.

- Browser acceptance is manual. There is no automated end-to-end browser suite or full cross-browser matrix.
- Keyboard/focus behavior has been spot-checked, but there is no complete accessibility audit.
- Input bounds and dual cache budgets are enforced. Three synthetic throughput cases and sampled service resident memory have been measured on one machine; diverse real workloads and exhaustive peak-allocation behavior have not. History can retain up to 50 project snapshots. Browser rolling operations still scan bounded windows; Python uses incremental windows.
- Numerical tests use independent analytical fixtures and nine TypeScript/Python differential fixtures. There is no broad property-based campaign, external certification, or formal proof.
- Extension is through build-time registration. There is no runtime plugin marketplace, remote code loading, or external plugin compatibility promise. New control types still need an explicit shared renderer implementation.
- Browser save is explicit and storage-dependent; there is no autosave recovery, collaboration, or hosted persistence.

These gaps are recorded so future claims stay proportional to the evidence. A small private local study has different acceptance requirements from a hosted multi-user scientific system.
