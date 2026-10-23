# Troubleshooting

| Symptom                                   | What to check                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev server will not start                 | Use Node ≥22.12, run `npm ci` in the repository root, and check whether port 5187 is already in use. Use the URL printed by Vite.                          |
| Dataset rejected                          | Check extension, file size, row/column count, timestamp timezone, duplicate timestamps, and mixed text/numeric columns. The error identifies the boundary. |
| Import finishes with no modules           | Expected: import creates assets. Choose Use on canvas or drag a source from Canvas → Sources.                                                              |
| Clicking a library module creates nothing | Expected: clicking shows its details. Drag it or choose Place module and then click the canvas.                                                            |
| Source has no series                      | Choose the correct dataset and a numeric value column. The `data` output can still expose its table.                                                       |
| A wire cannot connect                     | Check port data types, input cardinality, duplicate wiring, cycles, and the 120-connection limit.                                                          |
| Downstream module is blocked              | Fix the first upstream module with an error or missing output. Unrelated branches can still be ready.                                                      |
| Alignment produces no rows                | Exact intersection may have no common timestamps. Inspect source time ranges before choosing union or a regular grid.                                      |
| Too many stale cells                      | Compare sampling interval, maximum age, and observation/release times. Increase maximum age only when carrying older observations is meaningful.           |
| Rolling output stays warming              | Inspect complete valid samples and minimum ≤ window; alignment gaps may reduce usable pairs.                                                               |
| Correlation is undefined                  | A window may have zero variance or too few pairs. Undefined is not zero correlation.                                                                       |
| Statistical moments overflow              | Derived values became too large for floating-point calculations. Rescale upstream and review the units.                                                    |
| Fit fails or R² is null                   | X needs nonzero variance and at least three complete pairs. Constant Y has undefined R².                                                                   |
| Save in browser fails                     | Local storage may be disabled or full. Download a portable project instead.                                                                                |
| Results JSON does not open as a project   | Use File → Download project for UI restoration. Results JSON is a wrapper with an embedded `project`.                                                      |
| A linked dataset or module is unavailable | The route references an ID absent from the current project. Choose an existing item in the sidebar.                                                        |
| Calculation worker fails                  | Reload, reopen a portable project, and retry. If reproducible, report the failing module, parameters, data shape, and browser error.                       |

## Report a reproducible defect

Include the repository commit or release, Node/browser versions, steps, expected result, actual result, and a small synthetic project that reproduces the problem. Prefer synthetic inputs to private source data. For a numerical defect, include an independently calculated expected value and its assumptions.

Run `npm run check` and retain the relevant failure output when reporting a contributor-side issue. The [quality review](../code-quality.md) lists known verification gaps so a passing check is not mistaken for universal coverage.
