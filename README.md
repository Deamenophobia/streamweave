# Streamweave

A visual numerical workbench for multiple datasets, composable calculations, and reproducible outputs.

Read the [GitLab wiki](https://gitlab.com/Deamenophobia/streamweave/-/wikis/home) or its [versioned documentation source](docs/wiki/home.md) for tutorials, module reference, architecture, and the [code-quality review](docs/code-quality.md).

Import independent sources, align their timestamps, and connect calculations on a canvas. Branch a dataset into several analyses, duplicate a module with different parameters, and inspect each intermediate result. Charts, tables, and exports remain separate outputs.

![Streamweave numerical workbench](docs/workbench.png)

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5187**. The initial study connects two synthetic sensor datasets sampled at different intervals. An alignment module feeds rolling correlation, descriptive linear regression, and an export. Regression has separate coefficient and residual ports.

```sh
npm run check          # formatting, docs, boundaries, types, 50 behavioral/numerical tests, builds
npm run demo           # execute the multi-source study without the browser
npm run demo:pressure  # retained signed-event replay example
```

## Navigate the workspace

The persistent sidebar switches between three focused views. **Canvas** contains the graph and module library; **Datasets** inspects source rows, columns, units, and missing cells; **Results** displays one selected output or intermediate module at a time. The top **File / Edit / Examples** menus remain available in every view. Navigation preserves the graph, selection, and canvas viewport; browser Back and Forward work between views.

The canvas library supports search and drag-and-drop. Clicking a module shows its description; **Place module** explicitly starts placement. Its **Sources** tab provides the same placement controls for imported datasets. Charts and source previews occupy their own views instead of being stacked below the graph.

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

The repository and packages are private. No open-source license is granted. Third-party dependencies retain their own licenses.
