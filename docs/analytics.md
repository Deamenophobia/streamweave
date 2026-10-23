# Numerical contract

## General datasets and availability (v0.2)

Input tables contain scalar numbers, text, or null. Numeric observations have magnitude at most `1e12`; timestamps are non-negative integer milliseconds within the JavaScript date range. Imports sort by observation time and reject duplicates, invalid times, mixed column types, undeclared columns in saved projects, and oversized inputs. A unit label belongs to each numeric series; relabeling alone does not convert values. Use Scale & offset for explicit conversions.

`availableAtMs` defaults to `timestampMs` and cannot precede it. Derived lag, difference, rolling, and smoothed values propagate the latest availability of their inputs. Values with later availability can be inspected retrospectively, but an alignment never consumes them at an earlier time. A full-sample regression residual is available only at the last timestamp of the fit sample.

## Timestamp alignment

- **Intersection:** rows at timestamps present in all inputs. A value released later than its timestamp is null at that timestamp.
- **Union:** rows at timestamps present in any input; absent cells remain null. No interpolation.
- **Previous available:** regular UTC epoch-anchored grid, from the first grid point at/after the earliest observation to the latest observation time. At each grid time, choose the newest observation that has already been released. A late release of an older observation cannot replace a newer observation. Age is grid time minus observation time; exceeding the configured maximum makes the cell `stale` and null.

The grid does not automatically extend to the final release time. Supply a source covering the desired analysis horizon. Missing/null observations supersede older values; the aligner does not silently look past them. Repeated carried-forward values can introduce serial dependence, so a large aligned sample count is not evidence of independent information.

States are `valid`, `missing`, `stale`, `warming`, and `undefined`. Missing data is never replaced by zero. Select series preserves frame states. Charts break their line at nulls and show independent scales, units, timestamps, and valid/sample counts.

## Transformations and statistics

- Difference: `x[t] − x[t−lag]`, in source units.
- Percentage change: `100 × (x[t] / x[t−lag] − 1)`, undefined for a zero previous value.
- Log change: `ln(x[t] / x[t−lag])`, requiring two positive values.
- Lag: previous observation value at the current observation time. Lag counts observations, not seconds; extract a regularly aligned column first when constant intervals are needed.
- Scale/offset: `factor × value + offset`, with an explicitly assigned output unit.
- EMA: `previous + (1 − 2^(−elapsedMs / halfLifeMs)) × (value − previous)`. The first valid point seeds the filter; nulls reset it.
- Rolling mean, minimum, maximum, and valid count use the configured trailing observation window and skip nulls. The sample standard deviation divides the squared-deviation sum by `n−1`; fewer than two valid samples is undefined. Below the configured minimum sample count, the output is `warming`.
- Pair arithmetic operates on aligned rows. Addition/subtraction require matching unit labels; division by zero is undefined. Multiply/divide derive a textual unit. No automatic dimensional algebra or currency conversion is performed.

Rolling correlation uses complete aligned pairs within the trailing row window:

`r = Σ((x−mean(x))(y−mean(y))) / sqrt(Σ(x−mean(x))² × Σ(y−mean(y))²)`.

It requires at least three pairs and the configured minimum; zero variance is undefined. The output retains the complete-pair count. It is a descriptive Pearson statistic, without a significance test, independence assumption, or causal interpretation.

Linear fit is full-sample OLS with an intercept: `b = Sxy / Sxx`, `a = mean(y) − b × mean(x)`. At least three complete pairs and nonconstant X are required. It outputs pair count, intercept, slope, `R² = 1 − SSE / Syy`, and `RMSE = sqrt(SSE / n)`. Constant Y gives null R². Residuals equal `y − (a + b×x)`, retain original gaps, and carry the fit completion time. R² and RMSE describe the fitting sample; they are not holdout performance. Filter inputs before fitting to choose a period. No prediction or hypothesis-testing claims follow from the fit.

Arithmetic overflow becomes an undefined value or an explicit module error; non-finite outputs never pass the graph executor. Rolling kernels scan bounded windows; the current implementation prioritizes auditable behavior over maximum throughput.

## Optional signed-event module and legacy API

The rest of this document describes the retained pressure accumulator/replay API. It is separate from ordinary timestamped datasets. The v2 Directional pressure module requires availability at event time and rejects delayed-release rows; it returns the decayed pressure series. The legacy API also exposes the additional activity measures below. Legacy replay allows simultaneous events with distinct IDs; the v2 generic dataset importer requires unique timestamps.

### Observations and time

Each observation has a unique ID within its stream, a non-negative safe-integer timestamp in milliseconds, direction `1` or `-1`, and a finite weight between `1e-12` and `1e12`. Optional values must be finite with magnitude at most `1e12`. These numerical limits prevent floating-point overflow/underflow in aggregation. Rescale units before ingestion when necessary.

The live accumulator is forward-only. Late timestamps fail explicitly. A streaming adapter must reorder late data before calling it, or define its own rejection policy. Replay sorts a copy of the input chronologically and preserves input order for ties. A frame consumes all events with timestamps at or before that frame, never future events.

The window interval is `(now - windowMs, now]`. The left boundary is excluded. `snapshot(now)` advances the clock and evicts old observations even if no new observations arrive. Calling with an earlier time is an error.

Duplicate IDs currently retained by a window are ignored (`push` returns false). IDs leave this bounded deduplication set when their observations expire. Recording import/replay reject duplicates across the full recording. Integrations requiring indefinite exactly-once semantics need a durable upstream identity ledger.

### Pressure and decay

With positive weight P and negative weight N:

`I = 100 × (P - N) / (P + N)`.

For decayed pressure, each weight is multiplied by `2^(-ageMs / halfLifeMs)`. An observation exactly one half-life older has half the contribution of an otherwise equal observation. The implementation anchors relative ages to the newest retained event: the common age multiplier cancels in normalized pressure and effective sample size. This preserves stable ratios during quiet periods; time-window expiration still uses the caller's current time.

Smoothing uses `alpha = 1 - 2^(-elapsedMs / smoothingHalfLifeMs)` and `EMA = previous + alpha × (input - previous)`. The first eligible value initializes the filter. Missing/insufficient activity resets it. Uniform or decayed pressure can feed the smoother, according to the actual graph.

Pressure change is `(current raw pressure - previous raw pressure) / elapsedSeconds`, measured in index points per second. It is not substituted for pressure. Sustained positive flow keeps a positive pressure index even when its rate of change is zero.

### Activity and quality

- `eventsPerSecond`: number of retained events divided by the full configured window duration.
- `weightPerSecond`: total retained weight divided by that duration. Early windows are intentionally not annualized or extrapolated from the first/last event spacing.
- `effectiveEvents`: `(sum decayed weights)^2 / sum squared decayed weights` (Kish effective sample size). This describes concentration of weights, not independence or predictive confidence.
- `valueChange`: last minus first supplied value inside the window, only when at least two values are present.
- `status`: empty, warming, or ready according to the configured minimum event count. Ready means enough observations for this descriptive calculation, not statistically validated predictive power.

### Bounds and complexity

Windows are 1 ms to 1 hour; capacity is at most 100,000 retained events. Overflow fails visibly instead of changing the effective window by silently dropping valid events. Eviction is amortized O(1); snapshots scan the retained window in O(n), with bounded storage. This is a research implementation, not a latency benchmark claim.

Replay supports at most 100,000 events in a selected stream and 10,000 frames. The browser importer has a tighter 20,000-event limit. Computation runs in a worker, and changing inputs terminates the previous worker. Long or dense recordings should be downsampled or processed with a dedicated adapter.

## Validation before prediction

Any future forecasting layer needs its own explicit target and horizon. Compare against simple baselines using chronological holdouts; avoid splitting overlapping windows across training and evaluation. Report calibration and stability across independent recordings. The current project provides descriptive indicators only.
