# Validation

Validation covers the local implementation and reproducibility. It makes no claim about an external data provider or predictive performance.

## Automated checks — v0.2

`npm run check` passes formatting, documentation-link validation, source boundary/cycle checks, TypeScript checks, all **60 tests**, and both production builds. The examples were exercised in the original review: `npm run demo` executes all four outputs of the multi-source example; `npm run demo:pressure` executes the legacy replay example. Dependency audit reported zero known vulnerabilities during the quality review on 2026-10-24. Vite emits a non-fatal `use client` directive warning from React Flow in this client-only application.

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
