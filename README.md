# Streamweave

A visual numerical workbench for multiple datasets, composable calculations, and reproducible outputs.

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
npm run check          # type checking, 33 behavioral/numerical tests, production builds
npm run demo           # execute the multi-source study without the browser
npm run demo:pressure  # retained signed-event replay example
```

## Compose a workflow

1. Import one or several CSV, JSON, or JSONL files. Each file creates its own dataset and source module. Try [sensor-a.csv](examples/sensor-a.csv) and [sensor-b.csv](examples/sensor-b.csv).
2. Click or drag modules from the library. Modules can appear repeatedly. Move them freely and use **Focus canvas** for more room.
3. Connect compatible named ports by dragging between handles or clicking the output and then the input. One output can feed many downstream modules. Alignment and charts accept multiple inputs.
4. Select a module to configure it. **Duplicate module** copies its settings into an independent instance; connect its ports to create another branch. Disconnect in the inspector or select an edge and press Delete.
5. Inspect any module as a table or chart. Tables paginate through every row; charts preserve gaps, display units, and provide a time cursor. Invalid modules show an error; independent branches continue.
6. **Save** stores the graph and datasets in this browser. **Download project** creates a portable project; **Open** restores it. Output CSV contains values and quality states. Results JSON includes the graph, parameters, datasets, units, and engine version.

Calculations run automatically after changes; **Run** also triggers recomputation. Examples and Blank workspace replace the current in-memory project, so save/download work before switching. Browser storage has a size quota; use a project file for larger studies.

## Modules

| Category | Available modules |
|---|---|
| Data | Dataset; Select series from a timestamped table or aligned frame |
| Process | Row filter; timestamp alignment; difference / percent / log change / lag; scale and offset; time-based exponential smoothing |
| Analyze | Rolling mean / sample standard deviation / min / max / count; pair arithmetic; rolling Pearson correlation; descriptive linear fit; optional directional pressure |
| Output | Chart with multiple inputs and separate scales; paginated table; CSV / reproducible JSON export |

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
import { executeWorkbench, multiSourceExample, parseProject } from '@streamweave/core';

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
