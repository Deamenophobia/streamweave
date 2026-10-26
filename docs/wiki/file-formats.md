# File formats and archiving

## Recommendation for Streamweave

Use versioned JSON for a complete editable workspace. Use CSV today, and optionally Excel later, for exchanging tables and reports. YAML can be considered for hand-written recipes if that becomes a supported workflow. There is no single format that every analytical product must use.

| Purpose                             | Format                     | Status and contents                                                                                                       |
| ----------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Save and reopen a study             | `streamweave.project.json` | Implemented: graph, connections, parameters, node positions, source datasets, units, format/version                       |
| Export one source or result         | CSV                        | Implemented: flat data, including quality/availability fields where represented; does not restore a canvas                |
| Archive a result with its inputs    | Results + project JSON     | Implemented: selected results, embedded project, module ID and engine release; open the embedded project programmatically |
| Share multiple tables in a workbook | `.xlsx`                    | Proposed: sheets for sources/results and a manifest explaining units, parameters, and calculation version                 |
| Hand-write a calculation recipe     | YAML                       | Proposed: a constrained declarative recipe with schema validation; not needed for current GUI-authored saves              |

Excel would be useful for downstream analysis and human review. A workbook does not describe Streamweave's graph unless we define an additional custom schema. Translating graph operations into spreadsheet formulas would be a separate execution-engine project, with its own numerical compatibility requirements. A report should initially contain calculated values and explicit metadata.

JSON already preserves the full current workspace in one portable file. Local files can be copied, backed up, and versioned independently of browser storage. Export still requires a user action: it does not provide automatic crash recovery or a retention policy. Current browser Save remains explicit; autosave/recovery is separate future work.

## Design precedents

Jupyter uses a JSON document with explicit major/minor format versions, metadata, cells and outputs, validated against a schema. This supports the choice of a structured, versioned native document for editable analytical work; it is a precedent, not a requirement that Streamweave copy notebook semantics. [Jupyter format documentation](https://nbformat.readthedocs.io/en/stable/format_description.html).

Microsoft documents CSV as a text interchange format that saves one active worksheet and loses workbook formatting. It is appropriate for individual tables, while a workbook supports a richer report. Neither automatically captures this application's canvas semantics. [Excel file formats](https://support.microsoft.com/en-us/excel/file-formats-that-are-supported-in-excel).

YAML is a general serialization language with schemas, tags, and aliases. Its human-editable syntax can suit recipes. If added, define the supported scalar types and reject custom tags/unsupported constructs, with bounded parsing and the same domain validation used for JSON. Supporting another syntax creates another compatibility surface. [YAML 1.2.2 specification](https://yaml.org/spec/1.2.2/).

## Compatibility and reproducibility

- Validate the in-memory project before JSON serialization and validate decoded projects on import. Current adapters enforce a UTF-8 byte limit as well as core graph/data limits.
- Keep source data, timestamps, availability times, units, parameters, and connections together. Do not depend on a local file path that will be missing on another computer.
- Keep schema version separate from engine release. The current result export records release `0.2.0`; exact code revision, run history, dataset hashes and checksums remain future improvements. Record the repository commit alongside an archive when exact implementation provenance matters.
- Unknown project versions fail explicitly. There is no automatic v1-to-v2 migration. Introduce migrations only with representative historical fixtures and clear handling of unsupported modules.
- The current native file excludes undo history, viewport, selection, and transient worker state. Opening it restores the calculation and layout and recomputes results.
- If datasets outgrow the bounded JSON approach, consider a documented ZIP bundle containing a versioned manifest and separate data files. That is a future storage change requiring entry-size limits, path validation, checksums, and migration tests; it is not implemented now.

See [Results and projects](results-and-projects.md) for current actions and [Extension ownership](extension-guide.md) for the adapter implementation locations.
