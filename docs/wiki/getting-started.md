# Getting started

## Run locally

Install Node.js **22.12 or newer** and npm. Repository access is private; use your existing authorized GitLab SSH identity.

```sh
git clone git@gitlab.com:Deamenophobia/streamweave.git
cd streamweave
npm ci
npm run dev
```

Open **http://127.0.0.1:5187**. A saved browser project opens if present; otherwise the two-source example opens. Use **Examples → Two-source study** to load that example explicitly. Examples replace the in-memory document, so download any work you want to retain first.

The default appearance is **Classic · Retro**. Choose **Studio · Original** from the top-bar **Appearance** selector for the original dark interface. Your choice is remembered separately from project files. See [Appearance](appearance.md).

For a production build and local preview:

```sh
npm run build
npm run preview --workspace @streamweave/workbench
```

Use the URL printed by Vite. Preview serves the built application; it is not a production hosting service.

## First study: compare two sensors

The bundled example has **two datasets, nine modules, eight connections, and four output modules**. The values are synthetic and demonstrate the mechanics.

1. Open **Datasets**. Sensor A has 121 rows at 60-second intervals; Sensor B has 76 rows at 90-second intervals with a gap. Inspect **Preview** and **Columns & units**.
2. Return to **Canvas**. Both sources feed Align timestamps. Its default regular grid uses observations already available at each grid time, with a maximum age.
3. Select **Rolling correlation**. Its window is 20 observations and minimum is five complete pairs. Change the window to eight to recompute the branch.
4. Choose **Open module results** in the inspector. Switch to Chart to inspect the statistic, valid counts, and time cursor. These are descriptive results for the supplied sample.
5. Use **Edit in canvas** to return to the same module. Undo the parameter edit with the canvas control or **Edit → Undo**.
6. In **Results**, select Fit coefficients and Residual diagnostics. The fit uses the entire supplied sample; its residual chart is explicitly labeled in sample.
7. Choose **File → Download project** to keep a portable copy, including both source datasets.

## Start from your own files

1. Choose **File → New workspace**.
2. Open **Datasets → Import datasets**. Try the repository's [sensor-a.csv](../../examples/sensor-a.csv) and [sensor-b.csv](../../examples/sensor-b.csv), or prepare files following [Data and time](data-and-time.md).
3. Select a dataset and choose **Use on canvas**, then click the intended position. Repeat for the second source. Each source automatically selects its first numeric value column; inspect that choice and its unit.
4. Drag **Align timestamps** from the module library to the canvas. Connect both source `series` ports to its `series` input.
5. Add **Rolling correlation** and connect alignment's `frame` output to its `frame` input. Select distinct X and Y columns in the inspector.
6. Add **Chart** and connect correlation's `series` output to its `in` input.
7. Open Results and choose the chart. Save or export the project when satisfied.

Calculations run after data, parameters, or wiring changes. Moving modules only changes layout. The top **Run** button explicitly recomputes the project. An unconfigured module can show an error while unrelated valid branches continue.

For terminal-only execution, `npm run demo` runs the multi-source example using the same core. See [Contributor guide](contributing.md) for verification commands.
