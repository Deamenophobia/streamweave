# Validation

Validation is against the local implementation, not the behavior of an external service.

## Automated checks

Run `npm run check` for TypeScript checking, Node behavioral tests, and production builds of both packages.

The initial release passed type checking, all 20 tests, both production builds, and the headless replay example. The production dependency audit reported no known vulnerabilities at the time of the check. Vite emitted a non-fatal directive warning for the client-only React Flow dependency.

Tests cover analytical examples, scale invariance, left-boundary expiration, silence, exact half-life behavior, sustained directional flow, duplicate IDs, late events, stream isolation, invalid numeric inputs, capacity overflow, warmup, deterministic replay, absence of lookahead, irregular replay endpoints, bounded history wraparound, and agreement with an independent batch reference.

Pipeline tests verify that configuration changes and bypassing smoothing change the result. They also exercise incompatible connections, invalid graphs, malformed imports, CSV quoting and round-trips, duplicate data, and CSV formula-text handling.

## Browser acceptance results — 2026-10-24

- Passed: five visible modules and four visible connections on initial load.
- Passed: changing the window from 30 to 60 seconds changed the selected event count from 60 to 91 and recomputed the index.
- Passed: the pipeline name and 60-second configuration survived a reload after Save.
- Passed: a zero-duration window displayed an error and disabled replay.
- Passed: sustained positive flow displayed +100 with zero pressure change.
- Passed: the quiet example had zero observations and a missing index at 100 seconds.
- Passed: importing the sample CSV produced 40 observations and 51 replay frames. Exported CSV had 51 rows, including the empty final frame at 49,500 ms.
- Passed: exported pipeline JSON reopened successfully.
- Passed: removing smoothing blocked replay until the pressure output was connected directly to the indicator. The selected result changed from 53.7 to 60.6.
- Passed: Replay advanced the selected timestamp from 45 to 47 seconds; Reset restored the standard example pipeline.
- Passed: no browser console warnings or errors during these checks.

The checked browser view is saved in `workbench.png`. These are manual acceptance checks against the local development build. No external-source integration or predictive-performance claim is implied by these checks.
