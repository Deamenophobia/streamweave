# Changelog

Meaningful user and contributor changes are recorded here. The portable workspace format remains version 2.

## 0.2.0 — First public preview

### Publication

- Release Streamweave under MIT, with public GitHub documentation, contribution guidance, and a private vulnerability-reporting route.
- Introduce the canvas, output inspection, and both calculation engines in the README with current screenshots of synthetic examples.
- Run the existing core/workbench and Python checks in GitHub Actions, alongside the retained GitLab pipeline.
- Record supported scope, compatibility, and known limitations in the [release notes](docs/releases/v0.2.0.md).

### Changed

- Python engine 0.2.0 uses local HTTP protocol 2. Update the workbench and service together; the earlier HTTP protocol is no longer supported. Project files remain compatible.
- Reuse uploaded datasets and unchanged module results across calculations; progress responses contain no result rows.
- Use typed Python data/job contracts with Mypy in CI. Validate external datasets once and remove redundant internal shape checks.
- Replace rolling window rescans with incremental moments and monotonic queues, preserving missing-data and constant-window behavior.
- Bound caches by encoded payload and conservative Python-object size; expire idle sessions and completed jobs periodically.
- Report stable service error codes and total request time in the workbench. Preserve cooperative cancellation during numerical loops.
- Consolidate tests around numerical edge cases, meaningful workflows, and external boundaries. Compare timestamps and counts exactly.

### Documentation

- Add a root contribution guide and measured transfer, execution, and resident-memory results in the validation record.

## 2026-10-27 — Initial local Python engine

- Add an optional NumPy/SciPy engine for the existing 15 canvas modules, while retaining Browser as the default.
- Add shared module contracts, branch caching, cancellation, engine provenance, and cross-engine fixtures.
- Document setup, extension ownership, numerical behavior, and initial performance measurements.
