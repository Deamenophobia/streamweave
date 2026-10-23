# Data and time

## Supported imports

Import CSV, JSON arrays of row objects, or JSONL with one row object per line. A dataset is a timestamped table whose cells contain numbers, text, or null. Import sorts rows by observation time and rejects duplicate timestamps. Aggregate simultaneous records upstream or put them in separate datasets.

```csv
timestamp,temperature,site
2026-01-01T00:00:00Z,21.4,north
2026-01-01T00:01:00Z,,north
2026-01-01T00:02:00Z,22.1,north
```

Equivalent JSON uses `timestampMs` for integer epoch milliseconds:

```json
[
  { "timestampMs": 1767225600000, "temperature": 21.4, "site": "north" },
  { "timestampMs": 1767225660000, "temperature": null, "site": "north" }
]
```

Use explicit `Z` or a numeric timezone offset in ISO timestamps. The application displays UTC. An ISO `timestamp` is normalized to `timestampMs`; when both are supplied, `timestampMs` takes precedence. Empty cells become null. CSV numeric literals become numbers; preserve identifiers with leading zeros as strings in JSON if their spelling matters. A column cannot mix non-null numbers and text. Booleans, arrays, nested objects, unsafe column names, and text cells longer than 1,000 characters are rejected.

## Observation time and availability

`timestampMs` is when the observation describes the world. Optional `availableAtMs` is when that observation became available to the analysis. It defaults to observation time and must not precede it. For example, a measurement for 10:00 released at 10:02 must not enter a calculation evaluated at 10:01.

Derived series carry their availability information. Alignment consumes only observations available at the target time. Full-sample regression residuals become available at the fit's final timestamp; treating them as earlier forecasts would introduce future information.

## Align independent sources deliberately

| Mode               | Time axis                         | Missing-data behavior                                                                    |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------------- |
| Exact intersection | Timestamps present in all sources | Late-release values are null at that timestamp                                           |
| Exact union        | Timestamps present in any source  | Absent values stay null; no interpolation                                                |
| Previous available | Regular epoch-anchored UTC grid   | Uses the newest already-released observation; values older than maximum age become stale |

The regular grid ends at the latest observation time, not the latest release time. Maximum age measures elapsed time since the observation. A newly available null supersedes an older numeric value. Carrying values forward can create repeated, dependent observations; more grid rows do not necessarily mean more independent evidence.

## Units and states

Choose each source's numeric value column and unit in the inspector. Unit labels do not convert values. Use **Scale & offset** for an explicit conversion, then label its output. Addition/subtraction require matching labels. Multiplication/division derive textual labels, without dimensional algebra.

| State     | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| valid     | A value is available for this calculation                            |
| missing   | No usable observation at this point                                  |
| stale     | The last available observation exceeded maximum age                  |
| warming   | Not enough eligible observations for the configured calculation      |
| undefined | The operation has no finite defined result, such as division by zero |

Null never means zero. Charts preserve gaps, and CSV exports include quality states for series and aligned frames.

## Limits

| Boundary               | Current limit                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| Imported file          | 5,000,000 bytes in the browser; core also bounds text length                                                   |
| Dataset                | 20,000 rows, 40 columns                                                                                        |
| Workspace              | 12 datasets, 50,000 total input rows                                                                           |
| Portable project       | 15,000,000 bytes in the browser; imports reserve space by keeping combined data/project below 14,000,000 bytes |
| Input number magnitude | At most `1e12`                                                                                                 |
| Timestamp              | Non-negative safe integer milliseconds, up to `8.64e15`                                                        |
| Graph                  | 50 modules, 120 connections                                                                                    |
| Aligned frame          | 20,000 rows                                                                                                    |
| Rolling window or lag  | At most 1,000 observations                                                                                     |

These are explicit bounds, not measured capacity guarantees. Start with smaller subsets when exploring dense data. See [Numerical contract](../analytics.md) for formula details and [Troubleshooting](troubleshooting.md) for rejection messages.
