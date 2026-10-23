# Streamweave

A visual workbench for event-stream analysis, directional indicators, and reproducible replay.

Build an analytical pipeline on a canvas, inspect its intermediate measurements, and replay a recording against exactly the same core used by streaming callers. Files are processed locally in the browser.

![Streamweave workbench](docs/workbench.png)

## Run locally

Requires Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5187**. Choose an example recording, select a canvas module to edit its parameters, and move the replay slider to inspect a moment in time.

```sh
npm run check     # type checking, numerical/behavioral tests, production build
npm run demo      # headless replay example
```

## What works

- A React Flow canvas with typed ports, editable parameters, connection validation, and an optional smoothing stage.
- Time-based rolling windows, signed-weight pressure, exponential decay, activity rates, effective sample size, and separate pressure-change measurements.
- Deterministic event-time replay in a browser worker. Quiet intervals expire old observations.
- CSV, JSON, and JSONL recording import; CSV result export.
- Pipeline JSON import/export and browser-local pipeline saving.
- Four seeded examples: reversal, balanced activity, sustained positive flow, and silence.
- A dependency-free TypeScript core that also builds to JavaScript and type declarations for Node consumers.

The initial graph supports one source, one window, one pressure stage, one output, and optionally one smoother. Remove a module with the inspector or Delete; use the module list to add it back and reconnect compatible ports. Invalid graphs show an error and do not generate results.

## Event format

```json
[
  {"id":"a1","stream":"sensor-A","timestampMs":0,"direction":1,"weight":7,"value":100.2},
  {"id":"a2","stream":"sensor-A","timestampMs":500,"direction":-1,"weight":3,"value":100.1}
]
```

CSV uses `id,stream,timestampMs,direction,weight,value`; `value` is optional. `timestampMs` is a non-negative integer, expressed in milliseconds. All weights within a stream must use the same unit. Direction is explicitly `1` or `-1`; adapters are responsible for its meaning. Separate stream identifiers keep unrelated observations apart. Imports reject duplicate IDs within a stream and malformed rows.

Import limits: 5 MB and 20,000 events. Replay is limited to 10,000 frames; increase the sample interval for longer recordings. The visual examples are synthetic demonstrations of mechanics, not evidence of prediction quality.

## Use the core

```ts
import { PressureWindow } from '@streamweave/core';

const window = new PressureWindow('sensor-A', {
  windowMs: 30_000,
  halfLifeMs: 10_000,
  minEvents: 2,
});
window.push({id: 'a', stream: 'sensor-A', timestampMs: 0, direction: 1, weight: 7});
window.push({id: 'b', stream: 'sensor-A', timestampMs: 0, direction: -1, weight: 3});
console.log(window.snapshot(0).pressure); // 40
console.log(window.snapshot(30_000).status); // 'empty'
```

The repository uses npm workspaces; `npm run build` produces `packages/core/dist`. The core has no browser or network dependency. Packages are private and are not published to a registry.

## Interpretation

`pressure = 100 × (positive weight − negative weight) / total weight`.

The index ranges from −100 to +100. It describes the direction of observed flow; it is not a probability or an independently validated forecast. Activity, pressure, and change in pressure are reported separately. `empty` and `warming` windows return a null index, rather than inventing a neutral or high-confidence signal.

The chart displays the full recording for inspection. The highlighted frame and every computed output use only observations available at that frame's event time.

## Structure

```text
packages/core/       Pure analytics, typed graph validation, replay, parsers
apps/workbench/      Local canvas, inspector, timeline, import/export
examples/            Headless example and sample recording
docs/                Numerical contract, architecture, and validation record
```

See [the numerical contract](docs/analytics.md), [architecture and reuse decisions](docs/architecture.md), and [validation record](docs/validation.md).

## Current scope

The UI operates on examples and imported recordings. Streaming integrations can call the core incrementally; no hosted service or external data-source adapter is included in this version. Forecast calibration, chronological holdout evaluation, and richer graph composition are future work.

The repository is private. No open-source license is granted for this initial extraction. Third-party packages retain their own licenses.
