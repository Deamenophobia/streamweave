# Extension ownership

Start with the responsibility of the extension. Do not place new implementations in `App.tsx`, the scheduler, or a general utility file merely because those files can reach every service.

## Where code belongs

Paths below are relative to the repository root. These are implemented boundaries, with no runtime plugin loader.

| Extension                                  | Implementation location                                                                  | Connection point                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Numerical operation                        | `packages/core/src/workbench/math.ts`, or a focused sibling numerical module as it grows | Independently callable pure functions, numerical tests                                    |
| Canvas calculation module                  | `packages/core/src/workbench/modules/`                                                   | Ports, parameters, help, evaluator; register in `registry.ts`, add kind in `contracts.ts` |
| Dataset file format                        | `apps/workbench/src/adapters/`                                                           | `DatasetReader` in `datasetFormats.ts`; register the reader and extensions together       |
| Project format                             | `apps/workbench/src/adapters/projectJson.ts`                                             | `decodeProject`, `encodeProject`, `projectExport`; core owns project validation           |
| Result/report export                       | `apps/workbench/src/adapters/`                                                           | Return `ExportFile` content; `resultFormats.ts` holds current CSV/JSON encoders           |
| File delivery, browser storage, IDs        | `apps/workbench/src/platform/`                                                           | Browser APIs are isolated from encoders and calculation logic                             |
| Open/save/import, undo history             | `apps/workbench/src/documents/`                                                          | React orchestration calls adapters/platform and commits one document transaction          |
| Worker scheduling and calculation identity | `apps/workbench/src/execution/`                                                          | `calculation.ts`, shared response contracts, worker lifecycle                             |
| A new workspace view or focused feature    | `apps/workbench/src/features/<feature>/`                                                 | Feature owns its view/components; shell and navigation compose its public entry point     |

The dataset feature demonstrates the last convention: its view composes import controls, summary, preview, and column schema. Existing canvas and result components remain at the application source root; this change does not move unrelated files solely for symmetry. Shared `DataView.tsx` renders data for both dataset and result views.

Appearance is another focused feature: `features/appearance/` owns the catalogue, provider, selector, and scoped theme styles; `platform/appearanceStorage.ts` owns browser preference storage and document appearance changes. Both themes share the existing views. A theme must not introduce its own document state, calculation path, or workspace component tree. See [Appearance](appearance.md).

## Dependency direction

The optional local engine has its own ownership map in [Local Python engine](local-engine.md). Validated datasets, series, frames, graph values, and results have explicit internal types in `contracts.py`, checked by Mypy. Validate untrusted inputs at their boundary and reuse prepared data; do not add repeated row scans between trusted modules. Numerical implementations live under `services/engine/streamweave_engine/`; the HTTP/job layer calls the executor, which calls registered evaluators. The UI depends only on the `ComputeEngine` interface and validated wire protocol. Module metadata is generated from the core registry into `protocol/modules.json`, not maintained independently in Python. Adding a calculation requires implementations and parity fixtures for both engines; changing a transport requires no numerical changes.

The core imports only core code. The app uses its public `@streamweave/core` exports. Adapters can use the core and sibling adapters; they cannot depend on platform code, document orchestration, execution, or views. Platform code can use adapters. Documents can use platform/adapters. Execution owns its worker and request contract and cannot depend on views or document services.

`npm run check:boundaries` enforces these source import directions and rejects source dependency cycles. It is a lightweight import scan, not a semantic analysis of all runtime behavior. React imports in adapters/platform are forbidden. Feature views may call platform services for explicit user actions, but formats never call views.

## Example: add an Excel adapter

This is a future extension example; Excel import/export is not implemented.

1. Put workbook decoding/encoding in a focused `adapters/excel.ts`. Keep its dependency out of the analytics core and worker. Define sheet selection, timestamps, numeric types, nulls, units, and formula-cell behavior before decoding.
2. For source import, implement `DatasetReader.read(file, id)`. `DatasetFile` exposes text and binary reads. Normalize a supported sheet into the existing `Dataset` contract and validate it. Register extensions in `datasetFormats.ts`; file selection already derives its accepted extensions from that catalogue. Multi-sheet selection needs an explicit user workflow, not silent selection of the first sheet.
3. For result export, return an `ExportFile` containing workbook bytes. The existing `downloadFile` platform function handles delivery. Do not introduce workbook branches into `executeWorkbench` or individual calculation modules.
4. Add adapter fixtures for round-trips, nulls, text, units, dates, and large inputs. Add only the required format-selection UI and integration checks.

Text readers are currently registered together because their implementations share the same core parser. More complex formats should get their own files. Do not create placeholder implementations or a remote plugin discovery system.

## Calculation versus presentation

Project names and node positions are removed from worker calculation requests and their identity. Changing them does not rerun numerical work. Dataset changes, parameters, wiring, and explicit Run still trigger execution. Dataset objects must be replaced immutably, as history operations already require.

Node titles remain calculation dependencies: directional pressure currently uses its title as a series name, and blocked-node errors use upstream titles. Removing those dependencies without changing the output/diagnostic contract would leave stale labels. Do not assume all display-like fields are semantically irrelevant.

## Persistence extensions

Keep complete workspace persistence distinct from a result export. Validate before encoding so JSON cannot silently change `NaN` or infinity to null. Validate imported graph/data before committing the document. Preserve supported versions, reject unknown versions clearly, and add deliberate migrations with fixtures when needed. The current v2 shape is unchanged.

See [File formats and archiving](file-formats.md) for the recommended storage model, and [Contributing](contributing.md) for adding calculation modules and publishing documentation.
