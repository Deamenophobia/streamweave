# Scope and roadmap

## Implemented in v0.2

- Multiple file-based timestamped datasets and reusable source modules.
- A freely composed acyclic graph with typed ports, fan-out, repeated modules, and several output branches.
- Explicit alignment, transformations, rolling statistics, smoothing, pair arithmetic, descriptive correlation/linear fit, and an optional signed-event measure.
- Dedicated Canvas, Datasets, and Results views with persistent navigation and project menus.
- Local worker execution, bounded undo/redo, browser save, portable projects, and reproducible result exports.

The core and UI have explicit input/workspace limits. This is bounded batch analysis, with a separately retained incremental pressure API. It is not a live streaming scheduler or a complete scientific computing platform.

## Deliberately absent

Live provider connectors, arbitrary formulas/scripts, matrices and symbolic algebra, a MATLAB-compatible language, multivariate modeling, hypothesis tests, forecasting evaluation, shared editing, user accounts, scheduling, hosted storage, and external execution integrations are not implemented.

## Candidate next work

These are priorities for discussion, not release promises:

| Candidate                    | Why it matters                                                                        | Evidence required before calling it complete                                  |
| ---------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Automated browser workflows  | Catch navigation, wiring, undo, and persistence regressions                           | Repeatable tests against the built application on supported browsers          |
| Accessibility review         | Make menus, canvas alternatives, focus, and errors usable by keyboard/assistive tools | Keyboard and screen-reader audit with documented outcomes                     |
| Performance/memory profiling | Establish practical capacity for large graphs/data                                    | Reproducible workloads, latency/memory measurements, cancellation tests       |
| Named reusable subgraphs     | Reduce repeated wiring in larger calculations                                         | Explicit inputs/outputs, serialization, validation, versioned reuse           |
| Additional data adapters     | Bring independent sources into one contract                                           | Unit/time/release/revision semantics and deterministic adapter tests          |
| Formula or matrix modules    | Broaden the calculator beyond built-in statistics                                     | A bounded execution model, clear errors, numerical tests, and resource limits |

A generalized workbench should add operations when they support a coherent user workflow. A large formula catalogue alone does not make a useful product. Keep source preparation, composition, result interpretation, and reproducibility explicit.
