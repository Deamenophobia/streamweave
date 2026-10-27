# Streamweave

A local-first visual numerical workbench. Combine timestamped datasets, connect reusable calculations, and explore reproducible results with browser or optional Python execution.

[Documentation](docs/wiki/home.md) · [First study](docs/wiki/getting-started.md) · [Module reference](docs/wiki/module-reference.md) · [Contributing](CONTRIBUTING.md) · [Release notes](docs/releases/v0.2.0.md)

**v0.2.0 public preview · MIT licensed.** Designed for exploring sensor readings, operational measurements, and other timestamped data. The workbench runs locally and needs no account or external data feed.

![Classic canvas with two sensor sources, timestamp alignment, independent correlation and regression branches, and four outputs](docs/workbench.png)

_Compose the calculation itself: one source can feed several branches, and every module can be configured independently. Screenshot uses the bundled synthetic sensor study._

- **Combine sources:** import CSV, JSON, or JSONL, select columns and units, then align timestamps explicitly.
- **Compose analyses:** reuse 15 built-in modules for transformations, rolling statistics, correlation, linear fits, and outputs.
- **Inspect every step:** view intermediate values, quality states, charts, tables, and regression residuals.
- **Keep your work:** download a project containing the graph, parameters, and datasets; export CSV or results JSON with engine provenance.

## Quick start

Requires Node.js 22.12 or newer and npm.

```sh
git clone https://github.com/Deamenophobia/streamweave.git
cd streamweave
npm ci
npm run dev
```

Open **http://127.0.0.1:5187**. The bundled two-source study opens unless you previously saved a project. Python is not required for this workflow. Stop the development server with **Ctrl+C**.

### Try a first study

1. Choose **Examples → Two-source study**. Its synthetic sensors have different sampling intervals and a gap.
2. Open **Datasets** to inspect rows, columns, units, and missing values.
3. In **Canvas**, select **Rolling correlation** and change its window from 20 to eight observations. Calculations update automatically; moving a module changes only layout.
4. Open **Results** to inspect the correlation chart, fit coefficients, or residual diagnostics. Use **Edit → Undo** to restore the original window.
5. Choose **File → Download project** to retain the complete study. **Open project** restores it later. Examples replace the current in-memory document, so download work before switching.

![Results view showing rolling correlation, explicit valid sample counts, a time cursor, and CSV and JSON export controls](docs/results.png)

_Inspect one output at a time. Charts preserve gaps; tables retain values, timestamps, units, and quality states._

See the [step-by-step guide](docs/wiki/getting-started.md) to build the same workflow from your own files.

## Two engines, one workspace

|                  | Browser — default                                               | Python — optional                                                        |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Execution        | TypeScript core compiled to JavaScript, running in a Web Worker | Local Python 3.12 service using NumPy and SciPy                          |
| Start here for   | Quick exploration and small studies                             | Larger or repeated studies, and numerical-library extensions             |
| Additional setup | None after the quick start                                      | Install Python and start the local service                               |
| Repeated runs    | Runs the current graph in its worker                            | Reuses validated datasets and cached branches; transfers changed results |
| Compatibility    | Same 15 modules and v2 project format                           | Same 15 modules and v2 project format                                    |

Both engines calculate locally using binary64 arithmetic. Python is not automatically faster or more accurate. Small fresh studies often favor Browser; the [benchmark record](docs/validation.md#current-performance) separates computation, HTTP transfer, and cache reuse, with machine details and limits.

To enable Python, install **Python 3.12**, keep the workbench running, and open a **second terminal** in the repository root:

```sh
npm run engine:setup   # creates an isolated environment with pinned dependencies
npm run engine:start   # local service at 127.0.0.1:5191
```

Choose **Engine → Python · local service**. The status bar shows the producing engine, total request time, and cache hits. Reload starts with Browser; switching engines preserves the document. A stopped or incompatible Python service shows an explicit error, and you can select Browser to continue. Stop the service with **Ctrl+C**.

Update the workbench and service together: this release uses **HTTP protocol 2**, while portable project JSON remains **version 2**. See the [engine guide](docs/wiki/local-engine.md) for setup troubleshooting, cancellation, cache limits, and extension locations.

## Navigate the workspace

The sidebar switches between **Canvas**, **Datasets**, and **Results**. The top **File / Edit / Examples / Engine** menus remain available in every view. Navigation preserves the graph and canvas viewport; browser Back and Forward work between views.

Drag modules from the library, right-click empty canvas space, or press **Shift+A** to add one at a chosen position. Connect compatible ports, duplicate modules to compare parameters, and drag a wire into empty space to continue a branch. Clicking a library item shows details before placement. See the [canvas guide](docs/wiki/canvas-guide.md).

**Classic · Retro** is the default light appearance. Choose **Studio · Original** from the top-bar Appearance selector for the dark interface. Both share the same functionality; the preference is remembered separately from project data.

<details>
<summary>See the Studio appearance</summary>

![The same two-source canvas in the optional dark Studio appearance](docs/studio.png)

Read about [appearance settings](docs/wiki/appearance.md).

</details>

## Compose a workflow

1. Open **Datasets → Import datasets** to import CSV, JSON, or JSONL files. Importing creates data assets and opens the first source for inspection. **Use on canvas** returns to the canvas and asks where to place a source module. Alternatively, drag from the canvas sidebar's **Sources** tab or use **Place source**. Try [sensor-a.csv](examples/sensor-a.csv) and [sensor-b.csv](examples/sensor-b.csv).
2. Right-click empty canvas space or press **Shift+A** to search for a module at the pointer. The **Add module** button opens the same search, then lets you click where to place the module. Search alone changes nothing; Escape cancels. Modules can appear repeatedly.
3. Connect compatible named ports by dragging between handles or clicking the output and then the input. One output can feed many downstream modules. Alignment and charts accept multiple inputs.
4. Drag an output wire into empty space to search compatible modules; choosing one creates and connects it there. Select an existing module to configure it in the floating inspector. **Duplicate module** copies its settings and asks where to place the copy. Disconnect in the inspector or select an edge and press Delete.
5. Open **Results** and select an output or intermediate module in the sidebar. Choose its result port, then Table or Chart. Tables paginate through every row; charts preserve gaps, display units, and provide a time cursor. **Edit in canvas** returns to the selected module; the inspector's **Open module results** returns to its results. Invalid modules show an error; independent branches continue.
6. **File → Save in browser** stores the graph and datasets locally. **Download project** creates a portable project; **Open project** restores it. Output CSV contains values and quality states. Results JSON includes the graph, parameters, datasets, units, and engine version.

Calculations run automatically after changes; **Run** also triggers recomputation. Examples and **File → New workspace** replace the current in-memory project, so save/download work before switching. Browser storage has a size quota; use a project file for larger studies.

**Undo / Redo** or **Ctrl+Z / Ctrl+Shift+Z** work while the canvas has focus (Command on macOS; Ctrl+Y also redoes). A drag is one undo step. Creating a connected module or deleting a module with its wires is also one step. History retains 50 edits in memory and is not included in project files. Moving nodes does not rerun calculations.

## Modules

| Category | Available modules                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data     | Dataset; Select series from a timestamped table or aligned frame                                                                                                  |
| Process  | Row filter; timestamp alignment; difference / percent / log change / lag; scale and offset; time-based exponential smoothing                                      |
| Analyze  | Rolling mean / sample standard deviation / min / max / count; pair arithmetic; rolling Pearson correlation; descriptive linear fit; optional directional pressure |
| Output   | Chart with multiple inputs and separate scales; paginated table; CSV / reproducible JSON export                                                                   |

The graph has no prescribed path and no compulsory composite index. A column extracted from an aligned frame can feed a transformation, another alignment, a statistic, or its own output. Cycles, incompatible port types, and duplicate connections are rejected.

## Generic data format

```csv
timestamp,temperature,site
2026-01-01T00:00:00Z,21.4,north
2026-01-01T00:01:00Z,,north
2026-01-01T00:02:00Z,22.1,north
```

JSON accepts an array of row objects; JSONL accepts one object per line. Use `timestampMs` (integer epoch milliseconds) or `timestamp` (ISO date-time with an explicit timezone). Numbers, text, and null cells are supported. Numeric columns must not mix numbers and text. Rows are sorted; duplicate timestamps are rejected. Aggregate simultaneous records or split them into separate datasets before import.

Optional `availableAtMs` records when an observation became available and must not precede its timestamp. Each source chooses its numeric value column and unit. Ordinary datasets require neither direction nor weight. The optional signed-event module alone requires `direction` (`1` or `-1`) and positive `weight`, with availability at event time.

Alignment supports exact intersection, exact union, or a regular grid using the latest previously available observation and an explicit maximum age. It never pairs unrelated rows by position or fills gaps with zero. Output states distinguish `valid`, `missing`, `stale`, `warming`, and `undefined`.

## Use the core

```ts
import { executeWorkbench, multiSourceExample, parseProject } from "@streamweave/core";

const project = multiSourceExample();
const restored = parseProject(JSON.stringify(project));
const result = executeWorkbench(restored.graph, restored.datasets);
console.log(result.nodes.fit.outputs.model);
console.log(result.nodes.correlation.outputs.series);
```

The dependency-free TypeScript core builds to JavaScript and declarations in `packages/core/dist`. It reads no wall clock, network, browser state, or credentials. The workbench runs it in a cancellable Web Worker. The legacy `PressureWindow`, replay, and v1 pipeline APIs remain available; the v2 UI opens v2 project files only.

## Scope and limits

This is an early, file-based numerical workbench. It is a foundation for a lightweight visual calculator, with a bounded set of built-in modules. Live connectors, arbitrary formulas/scripts, multivariate models, forecast evaluation, and a MATLAB-compatible language are not included.

Limits: 12 datasets, 50,000 total input rows, 20,000 rows and 40 columns per dataset, 5 MB per imported file, 15 MB per project, 50 modules, 120 connections. Alignment is capped at 20,000 rows; rolling windows at 1,000 observations. Units are explicit labels with matching checks for addition/subtraction, not an automatic dimensional conversion system.

Correlation and regression describe the supplied sample. They do not establish causation or demonstrate forecasting accuracy. Full-sample regression residuals carry the fit completion time, and charts label them as in-sample. Synthetic examples demonstrate mechanics only.

See [the numerical contract](docs/analytics.md), [architecture and reuse decisions](docs/architecture.md), and [validation record](docs/validation.md).

## Development and support

```sh
npm run check          # formatting, docs, boundaries, types, tests, builds
npm run engine:check   # Python checks; requires engine:setup first
npm run demo           # execute the multi-source study without the browser
```

Start with [Contributing](CONTRIBUTING.md), the [extension ownership map](docs/wiki/extension-guide.md), and the [Changelog](CHANGELOG.md). GitHub is the public home for [issues](https://github.com/Deamenophobia/streamweave/issues), contributions, and [releases](https://github.com/Deamenophobia/streamweave/releases). Maintainers retain a GitLab copy; no GitLab access is needed to use or contribute to the public project. Report vulnerabilities through the [security policy](SECURITY.md).

## License

Streamweave is available under the [MIT license](LICENSE). Third-party dependencies retain their own licenses; see [dependency notices](THIRD_PARTY_NOTICES.md). Workspace packages remain marked `private` to prevent accidental npm publication; this does not restrict use under MIT.
