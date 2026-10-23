# Architecture and reuse decisions

Streamweave is a small extraction of useful analytical methods and interaction patterns from the owner's earlier projects. It is a new implementation with an explicit generic event schema; it does not carry over the old service deployment or application dependencies.

## Boundaries

1. **Core:** pure functions and forward-only accumulators. Callers supply time and data. No credentials, network access, storage, framework state, or wall-clock reads.
2. **Pipeline:** versioned JSON describing typed connections and parameters. Validation checks cardinality, compatible ports, unique IDs, configuration bounds, and cycles. The current supported path is source → window → pressure → optional smoothing → output.
3. **Workbench:** React Flow editor and inspector. A Web Worker executes replay; the UI only chooses the inspected frame. Coordinates do not affect analysis. Save persists the pipeline in browser-local storage; recordings remain in memory.
4. **Adapters:** future integrations translate observations into the generic schema. They own event identity, units, direction semantics, reconnect behavior, and late-data policy.

## What was retained

| Earlier asset | Retained idea | Refinement |
|---|---|---|
| Time-window flow tracker | Signed-weight aggregation and normalized directional pressure | Explicit millisecond windows, expiration during silence, correct half-life semantics |
| Visual analytical canvas | Typed ports, module configuration, replay inspection | Small schema; connections determine the computation; invalid routes fail visibly |
| Data visualization engine | Bounded chronological history | Generic typed buffer; capacity validation; kept separate from analytical-window retention |
| Multi-source data service | Per-stream isolation and separate flow measures | Explicit units and event-time clock; no wall-clock coupling |
| Signal composition service | Signal freshness and separation of measurements | Null output for insufficient activity; no hard-coded prediction-confidence values |

## Deferred after review

The high-performance GPU renderer is disproportionate to this first workbench. The existing identity, billing, remote-service routing, execution, and domain-specific monitoring components do not belong in the analytics core. A read-only automation interface can be added once the small core API stabilizes. Forecast ensembles and calibration require separate empirical work.

The detailed source inventory, exact paths, revision IDs, and source-specific findings are maintained separately in the owner's local project records. This repository describes the generic software actually implemented. Third-party dependency licenses are retained through their packages; this extraction grants no new rights to earlier repositories.
