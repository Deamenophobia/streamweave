# Module reference

Modules declare typed input/output ports and configurable parameters. The [registry](../../packages/core/src/workbench/registry.ts) composes the individual definitions under `workbench/modules/`. Each definition owns its parameter schema and evaluator; the inspector and engine use the same schema. `table` is a typed scalar table, `series` is timestamped numeric values with quality/availability, and `frame` is several numeric columns aligned on one time axis.

Stored project parameters use **milliseconds** for time fields. The inspector labels time controls in **seconds** and converts them. Window and lag parameters count observations, not elapsed time. Configure minimum samples no higher than the window.

| Module / stored type                | Input → output                                  | Parameters and defaults                                                                                                          |
| ----------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Dataset / `source`                  | none → `data`: table; optional `series`: series | `datasetId`, `column`, `unit`, `label` initially empty. Placement binds an available dataset and its first numeric value column. |
| Select series / `field`             | `data`: table or frame → `series`               | `column`, `unit`, `label` initially empty. Requires a numeric value column; a table must contain timestamps.                     |
| Filter rows / `filter`              | `data`: table → `data`: table                   | `column` empty; `operator=gte`; `value="0"`. Operators: `gte`, `lte`, `eq`, `present`. Null cells do not match.                  |
| Align timestamps / `align`          | `series`: two or more series → `frame`          | `mode=previous`, `stepMs=60000`, `maxAgeMs=150000`. Modes: previous, intersection, union.                                        |
| Change / lag / `transform`          | `series` → `series`                             | `operation=difference`, `lag=1`. Operations: difference, percent, log, lag.                                                      |
| Scale & offset / `scale`            | `series` → `series`                             | `factor=1`, `offset=0`, `unit=value`. Computes factor × value + offset.                                                          |
| Smooth / `smooth`                   | `series` → `series`                             | `halfLifeMs=180000`. Time-based EMA; nulls reset its state.                                                                      |
| Rolling statistic / `rolling`       | `series` → `series`                             | `operation=mean`, `window=10`, `minimum=3`. Operations: mean, std, min, max, count. Window 2–1,000; minimum 1–window.            |
| Pair arithmetic / `arithmetic`      | `frame` → `series`                              | `x`, `y` empty; `operation=subtract`. Operations: add, subtract, multiply, divide. Select distinct columns.                      |
| Rolling correlation / `correlation` | `frame` → `series`                              | `x`, `y` empty; `window=20`, `minimum=5`. Pearson correlation; window 3–1,000 and minimum 3–window.                              |
| Linear fit / `regression`           | `frame` → `model`: table; `residuals`: series   | `x`, `y` empty. Full-sample OLS with intercept, at least three complete pairs, nonconstant X.                                    |
| Directional pressure / `pressure`   | `data`: table → `series`                        | `windowMs=30000`, `halfLifeMs=10000`, `minimum=5`, `stepMs=1000`. Requires explicit numeric direction ±1 and positive weight.    |
| Chart / `chart`                     | `in`: one or more series/frames → no ports      | No parameters. Results lets you choose an incoming result; frame columns have separate charts/scales.                            |
| Table / `table`                     | `in`: one table, series, or frame → no ports    | No parameters. Paginated inspection of exact values and metadata.                                                                |
| Export / `export`                   | `in`: one table, series, or frame → no ports    | No parameters. CSV values or results JSON containing the complete project.                                                       |

## Composition examples

**Compare change instead of level:** two sources → separate Change modules → Align timestamps → Rolling correlation → Chart. This asks a different descriptive question from correlating raw levels.

**Compare two window lengths:** Align timestamps → two Rolling correlation modules configured with different windows → Chart with both incoming series. Select each incoming result in Results; the output does not combine them into a score.

**Use an aligned column again:** Align timestamps → Select series → Smooth → another alignment or output. Alignment is reusable within a larger acyclic graph.

**Convert units:** Dataset → Scale & offset → Align timestamps → Pair arithmetic. Relabeling a source without changing its numeric values is not a conversion.

## Interpretation and failure behavior

Incomplete modules report what is missing. An upstream failure blocks its descendants, while independent branches still execute. Missing values remain explicit. Zero variance makes correlation undefined; zero X variance prevents a linear fit. Arithmetic overflow produces undefined values or an explicit error. Statistical-moment overflow reports an error requesting rescaling rather than fabricating a finite correlation.

Pressure is an optional signed-event measure, separate from ordinary data analysis. It cannot infer direction from volume alone and rejects delayed-release events. The retained legacy API exposes additional pressure/activity measures described in the [numerical contract](../analytics.md).

Correlation, R², sample count, and pressure magnitude do not establish causation or calibrated forecasting confidence. A forecasting extension would need a separate target, chronological evaluation, and baselines.
