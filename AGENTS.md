# Streamweave contributor instructions

- Keep the analytics core independent of browser APIs, network clients, storage, and wall-clock reads.
- Use neutral event-stream terminology that accurately describes the implementation.
- Preserve explicit time units, stream isolation, null outputs for missing data, and bounded memory.
- Never present indicator magnitudes or sample counts as calibrated prediction probabilities.
- Keep changes to analytical behavior covered by independent numerical or behavioral tests.
- Give each component, hook, and module one clear responsibility. Keep graph editing, file I/O, worker execution, and result presentation separate; keep mathematical kernels independent of each.
- Keep each calculation module's ports, parameter schema, defaults, help, and evaluator together under `workbench/modules/`. Register it in `registry.ts`; do not add module-type branches to the scheduler or generic inspector.
- Derive inspector controls and engine parameter checks from the same schema. Keep UI icons/presentation out of graph-edit operations, and keep runtime services out of module definitions.
- Preserve acyclic source dependencies and the public core import boundary. `npm run check:boundaries` runs in the standard check and CI. Build-time module registration is the extension boundary; a runtime plugin loader requires a separate design.
- Prefer named operations and early returns over deeply nested JSX or chained conditional expressions. Concise code must remain readable; do not compress multiple statements onto a line.
- Use `npm run format` before submitting changes. `npm run check` includes the formatting gate.
- Treat a user edit as one undo transaction, including its incident wires. Keep canvas measurements and selection outside the portable project.
- Run `npm run check` before committing. Inspect the browser after canvas or interaction changes.
- Do not introduce credentials, external execution services, or telemetry into the workbench.
