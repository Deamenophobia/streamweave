"""Bounded vectorized windows and centered least squares; binary64 throughout."""

import numpy as np
from numpy.lib.stride_tricks import sliding_window_view
from scipy.linalg import lstsq

from .context import Context, Value, column_pair, series

BLOCK_ROWS = 256


def windows(values, width, fill=np.nan):
    return sliding_window_view(
        np.pad(np.asarray(values, dtype=np.float64), (width - 1, 0), constant_values=fill), width
    )


def centered(block):
    valid = np.isfinite(block)
    counts = valid.sum(axis=1)
    means = np.where(valid, block, 0).sum(axis=1) / np.maximum(counts, 1)
    deviations = np.where(valid, block - means[:, None], 0)
    return counts, means, deviations


def reduce_window(block, operation):
    counts, means, deviations = centered(block)
    reducers = {
        "mean": lambda: means,
        "count": lambda: counts,
        "std": lambda: np.sqrt(np.sum(deviations * deviations, axis=1) / np.maximum(counts - 1, 1)),
        "min": lambda: np.where(np.isfinite(block), block, np.inf).min(axis=1),
        "max": lambda: np.where(np.isfinite(block), block, -np.inf).max(axis=1),
    }
    return counts, reducers[operation]()


def rolling(context: Context) -> Value:
    src, p = context.value("series"), context.params
    width, minimum, operation = int(p["window"]), int(p["minimum"]), p["operation"]
    if not src["points"]:
        return {
            "series": series(
                f"{src['name']} · {operation}({width})",
                "observations" if operation == "count" else src["unit"],
                [],
            )
        }
    data = windows(
        [
            v["value"] if v["status"] == "valid" and v["value"] is not None else np.nan
            for v in src["points"]
        ],
        width,
    )
    availability = windows(
        [v.get("availableAtMs", v["timestampMs"]) for v in src["points"]], width, -np.inf
    ).max(axis=1)
    points = []
    with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
        for start in range(0, len(data), BLOCK_ROWS):
            context.checkpoint()
            block = data[start : start + BLOCK_ROWS]
            counts, values = reduce_window(block, operation)
            for j, value in enumerate(values):
                count = int(counts[j])
                state = (
                    "valid"
                    if np.isfinite(value) and not (operation == "std" and count < 2)
                    else "undefined"
                )
                if count < minimum:
                    state = "warming"
                i = start + j
                points.append(
                    {
                        "timestampMs": src["points"][i]["timestampMs"],
                        "availableAtMs": float(availability[i]),
                        "sampleCount": count,
                        "value": float(value) if state == "valid" else None,
                        "status": state,
                    }
                )
    unit = "observations" if operation == "count" else src["unit"]
    return {"series": series(f"{src['name']} · {operation}({width})", unit, points)}


def paired_arrays(frame, x, y):
    column_pair(frame, x, y)
    valid = np.array(
        [
            r["statuses"][x] == "valid"
            and r["statuses"][y] == "valid"
            and r["values"][x] is not None
            and r["values"][y] is not None
            for r in frame["rows"]
        ],
        dtype=bool,
    )
    left = np.array(
        [r["values"][x] if ok else np.nan for r, ok in zip(frame["rows"], valid, strict=True)],
        dtype=np.float64,
    )
    right = np.array(
        [r["values"][y] if ok else np.nan for r, ok in zip(frame["rows"], valid, strict=True)],
        dtype=np.float64,
    )
    return left, right, valid


def correlation(context: Context) -> Value:
    frame, p = context.value("frame"), context.params
    left, right, _ = paired_arrays(frame, p["x"], p["y"])
    width, minimum = int(p["window"]), int(p["minimum"])
    points = []
    if len(left):
        lx, ry = windows(left, width), windows(right, width)
        for start in range(0, len(left), BLOCK_ROWS):
            context.checkpoint()
            with np.errstate(over="ignore", invalid="ignore", divide="ignore"):
                counts, mx, dx = centered(lx[start : start + BLOCK_ROWS])
                _, my, dy = centered(ry[start : start + BLOCK_ROWS])
                xx, yy, xy = (dx * dx).sum(axis=1), (dy * dy).sum(axis=1), (dx * dy).sum(axis=1)
                ready = counts >= minimum
                if not all(np.isfinite(v[ready]).all() for v in (mx, my, xx, yy, xy)):
                    raise ValueError("Statistical moments overflowed. Rescale the input values.")
                denominator = np.sqrt(xx) * np.sqrt(yy)
                values = np.clip(xy / denominator, -1, 1)
            for j, value in enumerate(values):
                state = (
                    "warming"
                    if counts[j] < minimum
                    else "valid"
                    if denominator[j] > 0
                    else "undefined"
                )
                points.append(
                    {
                        "timestampMs": frame["rows"][start + j]["timestampMs"],
                        "sampleCount": int(counts[j]),
                        "value": float(value) if state == "valid" else None,
                        "status": state,
                    }
                )
    return {"series": series(f"Correlation · {width} rows", "correlation", points)}


def regression(context: Context) -> Value:
    frame, p = context.value("frame"), context.params
    x, y, valid = paired_arrays(frame, p["x"], p["y"])
    left, right = x[valid], y[valid]
    count = len(left)
    if count < 3:
        raise ValueError("Regression needs at least three complete pairs.")
    with np.errstate(over="ignore", invalid="ignore"):
        mx, my = left.mean(), right.mean()
        dx, dy = left - mx, right - my
        xx, yy, xy = np.dot(dx, dx), np.dot(dy, dy), np.dot(dx, dy)
    if not np.isfinite([mx, my, xx, yy, xy]).all():
        raise ValueError("Statistical moments overflowed. Rescale the input values.")
    if xx == 0:
        raise ValueError("Regression input X has zero variance.")
    # Centering/scaling avoids a badly conditioned [1, raw X] design matrix.
    scale = np.sqrt(xx)
    coefficient, _, _, _ = lstsq((dx / scale)[:, None], dy, lapack_driver="gelsd")
    slope = float(coefficient[0] / scale)
    intercept = float(my - slope * mx)
    if not np.isfinite([slope, intercept]).all():
        raise ValueError("Regression is numerically undefined. Rescale the input.")
    residual_values = right - (intercept + slope * left)
    sse = float(np.dot(residual_values, residual_values))
    a, b = column_pair(frame, p["x"], p["y"])
    x_unit, y_unit = a.get("unit", "value"), b.get("unit", "value")
    residuals = []
    for row, ok in zip(frame["rows"], valid, strict=True):
        status = (
            "valid"
            if ok
            else row["statuses"][p["x"]]
            if row["statuses"][p["x"]] != "valid"
            else row["statuses"][p["y"]]
        )
        value = row["values"][p["y"]] - (intercept + slope * row["values"][p["x"]]) if ok else None
        residuals.append(
            {
                "timestampMs": row["timestampMs"],
                "availableAtMs": frame["rows"][-1]["timestampMs"],
                "value": value,
                "status": status,
            }
        )
    rows = [
        {"statistic": "paired observations", "value": count, "unit": "count"},
        {"statistic": "intercept", "value": intercept, "unit": y_unit},
        {"statistic": "slope", "value": slope, "unit": f"{y_unit} / {x_unit}"},
        {
            "statistic": "R squared (in sample)",
            "value": 1 - sse / yy if yy > 0 else None,
            "unit": "ratio",
        },
        {"statistic": "RMSE (in sample)", "value": float(np.sqrt(sse / count)), "unit": y_unit},
    ]
    columns = [
        {"key": k, "label": k.title(), "type": "number" if k == "value" else "string"}
        for k in ("statistic", "value", "unit")
    ]
    return {
        "model": {"kind": "table", "columns": columns, "rows": rows},
        "residuals": series("OLS residuals · in sample", y_unit, residuals),
    }
