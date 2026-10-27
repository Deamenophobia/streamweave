"""Numerical operations: rolling kernels and centered/scaled least squares."""

import numpy as np
from numpy.typing import NDArray
from scipy.linalg import lstsq

from .context import Context, column_pair, series
from .contracts import Cell, Column, Frame, Outputs, Point
from .rolling import correlation_points, rolling_points


def rolling(context: Context) -> Outputs:
    source = context.series()
    width, minimum = int(context.number("window")), int(context.number("minimum"))
    operation = context.text("operation")
    points = rolling_points(source, width, minimum, operation, context.checkpoint)
    unit = "observations" if operation == "count" else source["unit"]
    return {"series": series(f"{source['name']} · {operation}({width})", unit, points)}


def correlation(context: Context) -> Outputs:
    frame, x, y = context.frame(), context.text("x"), context.text("y")
    column_pair(frame, x, y)
    width, minimum = int(context.number("window")), int(context.number("minimum"))
    points = correlation_points(frame, x, y, width, minimum, context.checkpoint)
    return {"series": series(f"Correlation · {width} rows", "correlation", points)}


def paired_arrays(
    frame: Frame, x: str, y: str
) -> tuple[NDArray[np.float64], NDArray[np.float64], NDArray[np.bool_]]:
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


def regression(context: Context) -> Outputs:
    frame = context.frame()
    x_key, y_key = context.text("x"), context.text("y")
    x, y, valid = paired_arrays(frame, x_key, y_key)
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
    a, b = column_pair(frame, x_key, y_key)
    x_unit, y_unit = a.get("unit", "value"), b.get("unit", "value")
    residuals: list[Point] = []
    for row, ok in zip(frame["rows"], valid, strict=True):
        status = (
            "valid"
            if ok
            else row["statuses"][x_key]
            if row["statuses"][x_key] != "valid"
            else row["statuses"][y_key]
        )
        left_value, right_value = row["values"][x_key], row["values"][y_key]
        value = (
            right_value - (intercept + slope * left_value)
            if ok and left_value is not None and right_value is not None
            else None
        )
        residuals.append(
            {
                "timestampMs": row["timestampMs"],
                "availableAtMs": frame["rows"][-1]["timestampMs"],
                "value": value,
                "status": status,
            }
        )
    rows: list[dict[str, Cell]] = [
        {"statistic": "paired observations", "value": count, "unit": "count"},
        {"statistic": "intercept", "value": intercept, "unit": y_unit},
        {"statistic": "slope", "value": slope, "unit": f"{y_unit} / {x_unit}"},
        {
            "statistic": "R squared (in sample)",
            "value": float(1 - sse / yy) if yy > 0 else None,
            "unit": "ratio",
        },
        {"statistic": "RMSE (in sample)", "value": float(np.sqrt(sse / count)), "unit": y_unit},
    ]
    columns: list[Column] = [
        {"key": k, "label": k.title(), "type": "number" if k == "value" else "string"}
        for k in ("statistic", "value", "unit")
    ]
    return {
        "model": {"kind": "table", "columns": columns, "rows": rows},
        "residuals": series("OLS residuals · in sample", y_unit, residuals),
    }
