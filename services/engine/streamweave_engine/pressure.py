import math

import numpy as np

from .context import Context, Value, series


def pressure(context: Context) -> Value:
    rows, p = context.value("data")["rows"], context.params
    if any(
        r.get("availableAtMs") is not None and r["availableAtMs"] != r["timestampMs"] for r in rows
    ):
        raise ValueError(
            "Directional pressure requires events available at their event time. Delayed-release data is not supported by this module."
        )
    if any(r.get("direction") not in (-1, 1) for r in rows):
        raise ValueError("direction must be 1 or -1.")
    if any(
        type(r.get("weight")) not in (int, float) or not 1e-12 <= r["weight"] <= 1e12 for r in rows
    ):
        raise ValueError("weight must be finite and between 1e-12 and 1e12.")
    if not rows:
        return {"series": series(context.node["title"], "pressure points", [])}
    start, end = rows[0]["timestampMs"], rows[-1]["timestampMs"] + p["windowMs"]
    frame_count = math.ceil((end - start) / p["stepMs"]) + 1
    if frame_count > 10_000:
        raise ValueError(
            "Replay exceeds 10,000 frames; increase the step or select a shorter recording."
        )
    if end > 8.64e15:
        raise ValueError("Pressure replay extends beyond the supported date range.")
    times = np.array([r["timestampMs"] for r in rows], dtype=np.float64)
    weights = np.array([r["weight"] for r in rows], dtype=np.float64)
    directions = np.array([r["direction"] for r in rows])
    points = []
    for index in range(frame_count):
        if index % 64 == 0:
            context.checkpoint()
        now = min(start + index * p["stepMs"], end)
        left, right = np.searchsorted(times, [now - p["windowMs"], now], side="right")
        count = int(right - left)
        state = "missing" if count == 0 else "warming" if count < p["minimum"] else "valid"
        value = None
        if state == "valid":
            relative = weights[left:right] / weights[left:right].max()
            weighted = relative * np.exp2(-(times[right - 1] - times[left:right]) / p["halfLifeMs"])
            positive = weighted[directions[left:right] == 1].sum()
            negative = weighted[directions[left:right] == -1].sum()
            value = float(np.clip(100 * (positive - negative) / (positive + negative), -100, 100))
        points.append({"timestampMs": now, "value": value, "status": state, "sampleCount": count})
    return {"series": series(context.node["title"], "pressure points", points)}
