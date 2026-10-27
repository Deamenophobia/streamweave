# Validation

Validation covers the local implementation and reproducibility. It makes no claim about an external data provider or predictive performance.

## Automated checks — v0.2

`npm run check` covers formatting, documentation-link and shared-contract validation, source boundary/cycle checks, TypeScript checks, **62 TypeScript tests**, and both production builds. `npm run engine:check` covers Ruff formatting/linting, static Python types, and **19 Python tests**. The examples were exercised in the original review: `npm run demo` executes all four outputs of the multi-source example; `npm run demo:pressure` executes the legacy replay example. Dependency audit reported zero known vulnerabilities during the quality review on 2026-10-24. Vite emits a non-fatal `use client` directive warning from React Flow in this client-only application.

## Backend hardening — 2026-10-28

Mypy checks all 21 engine source files. Python coverage is consolidated into 19 tests: nine shared projects, meaningful numerical/cache/service behaviors, and dependency directions. Six repeated document-rejection cases, a pre-execution cancellation mock, and the elementary sample-deviation subcase were removed. Invalid external inputs are checked through the actual HTTP boundary; cancellation is checked after a real rolling kernel has processed a chunk. Timestamp/availability/count parity is exact, with tolerance applied only to calculated numeric values.

The incremental-service check uploads datasets once, runs/reuses nine nodes, changes correlation with seven unaffected nodes reused, and proves source validation is not repeated. It also checks result/session isolation and a compact response. Idle cleanup is verified without a follow-up API request. The independent rolling study found and guards the transition-to-constant variance/correlation edge case while checking missing values, large-offset data, and changes in scale. A further regression check prevents overflowing removed moments from becoming a valid zero deviation.

Production-preview browser acceptance confirmed the Browser default, Python execution, nine-node reuse, a correlation edit with seven cached nodes, and Undo restoring the original results. Results JSON retained complete series values with Python 0.2.0 / protocol 2 provenance and numerical-library versions. The 40,000-input-row study completed, cancellation returned the UI to a cancelled state, and Run recovered ready results. The service test separately verifies cancellation within an active numerical kernel. No warning/error entries appeared in the browser log. `local-engine.png` records the updated result view and end-to-end timing. The temporary preview and engine processes were stopped after verification.

### Current performance

Same CPU and Python/numerical-library versions as the earlier run; Windows and Node 22.14.0. Five runs per case, medians. The TypeScript core runs under Node; it excludes worker transfer and UI rendering. Fresh Python HTTP includes dataset upload/validation, graph execution, result JSON, and 120 ms polling. Cached HTTP reuses both the validated source bundle and unchanged decoded outputs. Engine time excludes one-time upload preparation. The benchmark opens fresh HTTP connections to avoid a stale Node keep-alive socket after synchronous JS timing; this includes connection overhead in the HTTP figures.

| Rows per source / window | TypeScript core | Python engine | Python HTTP fresh | Python HTTP cached | Sampled service peak RSS |
| ------------------------ | --------------: | ------------: | ----------------: | -----------------: | -----------------------: |
| 1,000 / 100              |         27.4 ms |       55.0 ms |           99.4 ms |             7.4 ms |                 83.7 MiB |
| 5,000 / 500              |        319.5 ms |      285.2 ms |          585.3 ms |             7.0 ms |                111.0 MiB |
| 20,000 / 1,000           |      2,619.0 ms |    1,180.7 ms |        1,914.0 ms |             8.2 ms |                203.2 MiB |

All ten nodes were reused in cached cases. For the largest study, fresh request/response bodies total about 15.1 MB; a cached request/response totals about 5.4 KB. HTTP headers are excluded from byte counts. Peak RSS is sampled every 20 ms across each case, includes retained sessions/results and the Python runtime, and excludes Node/browser/probe processes. It can miss shorter allocation spikes and is not a hard memory-limit guarantee. Raw samples and baselines are in [engine-benchmark.json](engine-benchmark.json). The small fresh study remains faster in Browser.

## Local engine verification — 2026-10-27

Nine shared projects exercise all 15 modules, alignment modes, delayed availability, missing and degenerate data, error propagation, and NumPy block boundaries. Their outputs agree within relative/absolute tolerance 1e-9, with exact nonnumeric fields; human-readable error wording may differ. Independent known-answer tests verify sample deviation and a line with slope 2 and intercept 3. Cache tests prove unchanged reuse, invalidation of a modified branch, source-data invalidation, and bounded eviction. Service tests cover job/result isolation, cancellation, concurrency limits, malformed/non-finite/oversized input, origin/host/protocol checks, and retention measured from completion.

The Python test client currently reports a dependency deprecation warning about its httpx transport. It does not affect the application service or test results; migration to the replacement test transport remains a maintenance item.

Production-preview browser acceptance covered Browser as the reload default, Python selection, full-cache rerun, and correlation-window invalidation (seven reused modules; Undo restored all nine). Stopping the service produced an explicit error and disabled result exports; selecting Browser recovered the same graph. A 40,000-input-row Python study was cancelled, and switching to Browser during a subsequent Python run left the Browser result authoritative. The exported results file recorded Python 0.1.0, NumPy 2.3.4, SciPy 1.16.3, protocol 1, and the contract hash. Both themes and the Engine menu were checked at normal and 480-pixel widths; temporary viewport overrides were reset. The browser warning/error log was empty in the final rebuilt session. These are manual checks, not an automated end-to-end suite.

### Measured performance

Windows, Intel Core i5-10400F, Node 22.14.0, Python 3.12.10, NumPy 2.3.4, SciPy 1.16.3; single-thread numerical libraries, warm runtimes, five runs per case, medians in milliseconds. Each project has two sources, alignment, rolling correlation, sample deviation, OLS, and four outputs. Rows are **per source**, so the largest case has 40,000 input rows.

| Rows / window  | TypeScript core | Python engine | Python cached | Python HTTP fresh | Python HTTP cached |
| -------------- | --------------: | ------------: | ------------: | ----------------: | -----------------: |
| 1,000 / 100    |            45.9 |          53.8 |          15.1 |             199.1 |              187.4 |
| 5,000 / 500    |           483.8 |         351.9 |          70.3 |             651.1 |              384.3 |
| 20,000 / 1,000 |         3,579.9 |       2,590.4 |         273.0 |           3,363.7 |            1,062.1 |

TypeScript is the browser's core executed under Node, excluding worker transfer and UI rendering. Python engine time includes validation, hashing, calculations, and preparation of bounded outputs but excludes HTTP serialization. HTTP includes complete request/result JSON and 120 ms polling, excluding UI rendering. These are different layers, deliberately reported separately. Python's calculation phase helps the larger cases; full transfer overhead erases the gain for small/medium cold runs. An unchanged cached large request is about 3.4 times faster than the uncached TypeScript core in this fixture, not a general language speed claim. No peak-memory benchmark or production throughput claim is implied.

Reproduce with `npm run engine:start` and `npm run engine:benchmark`. Raw samples are retained in [2026-10-27 raw samples](engine-benchmark-2026-10-27.json); the script writes fresh measurements under `.local/`.

The 15 workbench tests cover:

- Generic imports without direction/weight, explicit nulls, timestamp sorting and duplicate rejection.
- Alignment by timestamp rather than array position, intersection/union, missing/stale distinctions, and delayed/out-of-order release handling.
- Repeated module instances, fan-out, rewiring with changed numerical results, and independent branch execution after an error.
- Typed ports, connection cardinality, duplicate IDs, and cycle rejection.
- Analytical correlation/OLS fixtures with known slope, intercept, residuals, and zero-variance behavior.
- Known rolling mean/sample deviation/EMA values, lag, zero denominators, missing values, and unit compatibility.
- Portable project round-trips, both complete examples, CSV quoting/formula-text escaping, size/count bounds, frame-to-series composition, residual gaps, and availability restrictions.
- Explicit statistical-moment overflow errors and rejection of the 121st connection before mutation.

The retained 20 legacy tests cover pressure scale invariance, left-boundary expiration, silence, half-life semantics, extreme weights, duplicate/late events, stream isolation, capacity, warmup, deterministic replay without lookahead, irregular endpoints, history wraparound, an independent batch reference, v1 pipeline configuration/rewiring, and parser/export behavior.

Seven editor tests cover immutable connected insertion, compatible module search, atomic deletion, grouped drag history, bounded undo/redo, importing data without creating nodes, and stopping oversized import batches before excess file reads.

Three project-opening tests use controlled asynchronous completions to verify that late reads cannot replace a newer workspace, newer open requests win, and stale failures do not surface in another document. See [the code-quality review](code-quality.md) for scope and remaining gaps.

Three module-contract tests cover an independently defined evaluator, invalid input/output rejection, non-finite outputs, schema defaults, and dependent numeric bounds. Two parameter-option tests verify resolution of the declared dataset/input port and graceful behavior when inputs are absent.

## Appearance acceptance — 2026-10-27

- Classic was selected on first load without a saved preference. Switching to Studio preserved nine modules, eight wires, and the exact canvas viewport transform. Reload retained Studio. Switching appearance did not add an undo entry.
- Canvas, Datasets, and Results were visually checked in both appearances against a production preview on port 5188. The correlation result remained 116/121 valid with a final value of 0.997488.
- Classic's module picker and parameter inspector were checked. An invalid alignment grid interval produced readable error states; Undo restored ready branches.
- Layouts were checked at 1280 × 720, 800 × 800, and 480 × 800. The compact header wraps at the narrowest size, keeping menus, appearance, and Run available. Viewport overrides were reset afterward.
- Three automated tests cover default/unknown preferences, persistence independent of project storage, and blocked storage/read or quota/write failures. Save failure leaves the chosen appearance active for the session and exposes a status message in the selector.
- `workbench.png`, `datasets.png`, and `results.png` show Classic; `studio.png` shows the retained original canvas. These are spot checks, not a complete accessibility or cross-browser audit.

## Extension/file boundaries acceptance — 2026-10-26

- Seven additional automated tests cover both native project round-trips and identical serialized calculation results; non-finite input rejection before encoding; unknown project versions/results wrappers; equivalent CSV/JSON/JSONL import with missing cells; and calculation identity for names, positions, parameters, wires, and output-relevant node titles.
- The production build was served separately on localhost port 5188. Dataset Preview and Columns & units rendered correctly after the feature split, including empty and populated states.
- A renamed project downloaded as v2 JSON. After creating a blank workspace and importing the exported source CSV, the workspace contained one 121-row dataset and zero modules. Opening the downloaded project restored its name, two datasets, nine modules, eight connections, and four outputs.
- Browser Save followed by reload restored the renamed project. Results showed 116/121 valid correlation values and all branches ready. The browser warning/error log was empty during these checks.
- Source boundary/cycle checks cover 76 files, including enforced adapter/platform/document/execution dependency directions. These remain lightweight source-import checks, not a complete runtime dependency analysis.

## Module-boundary refactor acceptance — 2026-10-24

- The two bundled projects and their full calculation results were captured before/after the refactor and compared structurally; both remained identical.
- Correlation's inspector exposed the schema's minimum window of three. Changing its window from 20 to eight changed the minimum-sample maximum to eight and recomputed 109/121 valid values. Undo restored 20 with all eight wires present.
- Alignment showed 60-second grid and 150-second maximum-age controls in previous mode. Exact intersection hid them; Undo restored both values and controls.
- Source selectors resolved the correct dataset, numeric reading column, label, and unit after reload. The workbench completed all default branches successfully.
- Source dependency checks passed across the refactored core and UI. Existing public exports and v2 project shapes remain available.

## Workspace navigation acceptance — 2026-10-24

- The persistent top menus and sidebar were checked at 1280 × 720. Only one main view is visible; the document fits the window and long tables scroll inside their view.
- Canvas → Datasets → Results → Canvas preserved all nine modules, eight wires, and the exact canvas viewport transform. Browser Back and Forward work between routes; Results remembers an explicitly selected module.
- Directly reloading a dataset route and then opening Canvas produces the correct initial fit. The canvas initializes on its first visible visit, avoiding measurement of a hidden container.
- Searching and clicking Smooth changed only the library's description/selection. Place module followed by Escape left the graph unchanged. Dragging Smooth from the sidebar placed it at the drop coordinates; Undo removed it.
- Importing the two example CSVs into New workspace created two datasets and zero modules, then opened the first dataset. Preview and Columns & units showed its rows, schema, units, and missing cells. Use on canvas placed a bound source; Undo remained available from the top Edit menu in Results.
- Results displayed one selected output at a time. Selecting Linear fit exposed separate model/residual ports, coefficient tables, and the in-sample residual chart. Edit in canvas focused that module; Open module results returned to its result view.
- Opening a downloaded project restored two datasets, nine modules, eight connections, and ready outputs. No new browser errors appeared after the final reload.

`workbench.png`, `datasets.png`, and `results.png` record the focused views. The checks below describe earlier revisions; the navigation above replaces the former drawer and stacked output layout.

## Earlier canvas revision acceptance — 2026-10-24

- Module search leaves the graph unchanged. Toolbar insertion enters placement mode; the chosen module appeared at the clicked screen coordinates. Right-click search inserts at its invocation point.
- Dragging Sensor A's series port into empty space offered compatible modules only. Choosing Smooth created a ready module and its incoming wire; one Undo removed both and Redo restored both.
- Delete removed the selected connected module and its wire. One Undo restored both. Wires remained visible after recalculation and undo.
- A module drag was one undo step. Shift+A opened search; Escape cancelled it without changing the graph.
- Importing both example CSVs into a blank workspace created two data assets and zero modules. Clicking an asset inspected its table. Place source created a bound source at the chosen point; dragging the second asset created its own source.
- The full-width canvas, contextual search, floating inspector, and data drawer were checked in the browser after the component refactor.
- Changing the correlation window from 20 to 8 recomputed its chart (116 to 109 valid samples); Undo restored 20. All eight wires stayed visible.
- Save/reload and Download project → Blank workspace → Open restored the two datasets, nine modules, eight connections, and ready outputs. No new browser errors or warnings were logged during the final checks after reload.

## Initial v0.2 browser acceptance — 2026-10-24

The following were exercised through the earlier v0.2 UI. Module creation and import gestures were subsequently replaced by the canvas revision above:

- Default study: **2 sources, 9 modules, 8 connections, 4 independent outputs**, all ready.
- Switching alignment from a regular grid to exact intersection changed the aligned output from **121 to 37 rows** and recomputed downstream analyses.
- Duplicated correlation, configured its window to **8** observations while retaining the original **20**, and connected both series to the same chart. The graph reported **10 modules and 10 connections**, all ready.
- Dragged the duplicated module to a new position without changing its calculation.
- Saved and downloaded that project, opened a blank workspace, and reopened it with its datasets, parameters, and connections intact.
- Started blank and imported the two supplied CSV files together: **121 rows** and **76 rows** became independent source modules.
- Added alignment, pair arithmetic (B / A), and a chart through the library and connected their named ports: **5 modules and 4 connections**, all ready.
- Ratio output contained **121 rows / 114 valid**, preserving missing/stale cells. Exported CSV included unit and status columns. Re-executing the exported JSON project outside the browser reproduced the exported series exactly.
- Table pagination advanced the aligned export to page **2 / 5**, starting at **00:25 UTC**.
- Save/reload restored the multi-source study. Browser error/warning log was empty during acceptance checks.

These are manual acceptance checks against the development build; the core tests also run in GitLab CI. `workbench.png` records the checked interface. No external-source integration, production deployment, or broad performance benchmark is implied.

## Known boundaries

The UI is a bounded file-based workbench with built-in operations. Browser Save is subject to local storage quota; portable project downloads are the larger-workspace path. Live connectors, scripting, arbitrary matrix operations, multivariate inference, and forecasting validation remain outside v0.2. The v2 UI intentionally does not auto-migrate v1 pipeline files; legacy APIs remain tested and available.
