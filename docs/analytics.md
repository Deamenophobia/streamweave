# Numerical contract

## Observations and time

Each observation has a unique ID within its stream, a non-negative safe-integer timestamp in milliseconds, direction `1` or `-1`, and a finite weight between `1e-12` and `1e12`. Optional values must be finite with magnitude at most `1e12`. These numerical limits prevent floating-point overflow/underflow in aggregation. Rescale units before ingestion when necessary.

The live accumulator is forward-only. Late timestamps fail explicitly. A streaming adapter must reorder late data before calling it, or define its own rejection policy. Replay sorts a copy of the input chronologically and preserves input order for ties. A frame consumes all events with timestamps at or before that frame, never future events.

The window interval is `(now - windowMs, now]`. The left boundary is excluded. `snapshot(now)` advances the clock and evicts old observations even if no new observations arrive. Calling with an earlier time is an error.

Duplicate IDs currently retained by a window are ignored (`push` returns false). IDs leave this bounded deduplication set when their observations expire. Recording import/replay reject duplicates across the full recording. Integrations requiring indefinite exactly-once semantics need a durable upstream identity ledger.

## Pressure and decay

With positive weight P and negative weight N:

`I = 100 × (P - N) / (P + N)`.

For decayed pressure, each weight is multiplied by `2^(-ageMs / halfLifeMs)`. An observation exactly one half-life older has half the contribution of an otherwise equal observation. The implementation anchors relative ages to the newest retained event: the common age multiplier cancels in normalized pressure and effective sample size. This preserves stable ratios during quiet periods; time-window expiration still uses the caller's current time.

Smoothing uses `alpha = 1 - 2^(-elapsedMs / smoothingHalfLifeMs)` and `EMA = previous + alpha × (input - previous)`. The first eligible value initializes the filter. Missing/insufficient activity resets it. Uniform or decayed pressure can feed the smoother, according to the actual graph.

Pressure change is `(current raw pressure - previous raw pressure) / elapsedSeconds`, measured in index points per second. It is not substituted for pressure. Sustained positive flow keeps a positive pressure index even when its rate of change is zero.

## Activity and quality

- `eventsPerSecond`: number of retained events divided by the full configured window duration.
- `weightPerSecond`: total retained weight divided by that duration. Early windows are intentionally not annualized or extrapolated from the first/last event spacing.
- `effectiveEvents`: `(sum decayed weights)^2 / sum squared decayed weights` (Kish effective sample size). This describes concentration of weights, not independence or predictive confidence.
- `valueChange`: last minus first supplied value inside the window, only when at least two values are present.
- `status`: empty, warming, or ready according to the configured minimum event count. Ready means enough observations for this descriptive calculation, not statistically validated predictive power.

## Bounds and complexity

Windows are 1 ms to 1 hour; capacity is at most 100,000 retained events. Overflow fails visibly instead of changing the effective window by silently dropping valid events. Eviction is amortized O(1); snapshots scan the retained window in O(n), with bounded storage. This is a research implementation, not a latency benchmark claim.

Replay supports at most 100,000 events in a selected stream and 10,000 frames. The browser importer has a tighter 20,000-event limit. Computation runs in a worker, and changing inputs terminates the previous worker. Long or dense recordings should be downsampled or processed with a dedicated adapter.

## Validation before prediction

Any future forecasting layer needs its own explicit target and horizon. Compare against simple baselines using chronological holdouts; avoid splitting overlapping windows across training and evaluation. Report calibration and stability across independent recordings. The current project provides descriptive indicators only.
