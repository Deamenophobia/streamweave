# Validation

Validation covers the local implementation and reproducibility. It makes no claim about an external data provider or predictive performance.

## Automated checks — v0.2

`npm run check` passes formatting, TypeScript checks, all **39 tests**, and both production builds. `npm run demo` executes all four outputs of the multi-source example; `npm run demo:pressure` still executes the legacy replay example. Dependency audit reported zero known vulnerabilities during the lockfile update on 2026-10-24. Vite emits a non-fatal `use client` directive warning from React Flow in this client-only application.

The 13 workbench tests cover:

- Generic imports without direction/weight, explicit nulls, timestamp sorting and duplicate rejection.
- Alignment by timestamp rather than array position, intersection/union, missing/stale distinctions, and delayed/out-of-order release handling.
- Repeated module instances, fan-out, rewiring with changed numerical results, and independent branch execution after an error.
- Typed ports, connection cardinality, duplicate IDs, and cycle rejection.
- Analytical correlation/OLS fixtures with known slope, intercept, residuals, and zero-variance behavior.
- Known rolling mean/sample deviation/EMA values, lag, zero denominators, missing values, and unit compatibility.
- Portable project round-trips, both complete examples, CSV quoting/formula-text escaping, size/count bounds, frame-to-series composition, residual gaps, and availability restrictions.

The retained 20 legacy tests cover pressure scale invariance, left-boundary expiration, silence, half-life semantics, extreme weights, duplicate/late events, stream isolation, capacity, warmup, deterministic replay without lookahead, irregular endpoints, history wraparound, an independent batch reference, v1 pipeline configuration/rewiring, and parser/export behavior.

Six editor tests cover immutable connected insertion, compatible module search, atomic deletion, grouped drag history, bounded undo/redo, and importing data without creating nodes.

## Canvas revision acceptance — 2026-10-24

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
