# Streamweave contributor instructions

- Keep the analytics core independent of browser APIs, network clients, storage, and wall-clock reads.
- Use neutral event-stream terminology that accurately describes the implementation.
- Preserve explicit time units, stream isolation, null outputs for missing data, and bounded memory.
- Never present indicator magnitudes or sample counts as calibrated prediction probabilities.
- Keep changes to analytical behavior covered by independent numerical or behavioral tests.
- Run `npm run check` before committing. Inspect the browser after canvas or interaction changes.
- Do not introduce credentials, external execution services, or telemetry into the workbench.
