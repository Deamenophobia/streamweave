"""One adversarial study checks rolling numerics against an independent batch reference."""

import math
import random

import pytest

from streamweave_engine.rolling import correlation_points, rolling_points


def test_window_transitions_missing_data_and_large_offsets():
    randomizer = random.Random(814)
    # Enter/leave constant stretches and missing runs, with variation near float spacing.
    values = [1e9 + randomizer.randrange(-20, 20) / 1024 for _ in range(300)]
    values[90:140] = [1e9] * 50
    values[170:200] = [None] * 30
    values[240:] = [randomizer.randrange(-20, 20) * 1e-6 for _ in range(60)]
    width = 23
    source = {
        "kind": "series",
        "name": "offset",
        "unit": "m",
        "points": [
            {
                "timestampMs": 1_767_225_600_000 + i * 1000,
                "availableAtMs": 1_767_225_600_000 + i * 1000 + (5000 if i % 17 == 0 else 0),
                "value": v,
                "status": "missing" if v is None else "valid",
            }
            for i, v in enumerate(values)
        ],
    }
    results = {
        op: rolling_points(source, width, 1, op, lambda: None)
        for op in ("mean", "std", "min", "max", "count")
    }
    frame = {
        "kind": "frame",
        "columns": [],
        "rows": [
            {
                "timestampMs": p["timestampMs"],
                "values": {"x": p["value"], "y": p["value"]},
                "statuses": {"x": p["status"], "y": p["status"]},
            }
            for p in source["points"]
        ],
    }
    correlations = correlation_points(frame, "x", "y", width, 2, lambda: None)
    for i, point in enumerate(source["points"]):
        window = source["points"][max(0, i - width + 1) : i + 1]
        valid = [p["value"] for p in window if p["value"] is not None]
        for output in results.values():
            assert output[i]["timestampMs"] == point["timestampMs"]
            assert output[i]["availableAtMs"] == max(p["availableAtMs"] for p in window)
            assert output[i]["sampleCount"] == len(valid)
        if not valid:
            assert all(output[i]["value"] is None for output in results.values())
            continue
        shifted = [v - valid[0] for v in valid]
        mean = math.fsum(shifted) / len(valid)
        expected = {
            "mean": valid[0] + mean,
            "count": len(valid),
            "min": min(valid),
            "max": max(valid),
        }
        for op, value in expected.items():
            assert results[op][i]["value"] == pytest.approx(value, rel=0, abs=2e-7)
        if len(valid) > 1:
            deviation = math.sqrt(math.fsum((v - mean) ** 2 for v in shifted) / (len(valid) - 1))
            assert results["std"][i]["value"] == pytest.approx(deviation, rel=1e-8, abs=1e-10)
            assert correlations[i]["value"] == (pytest.approx(1, abs=1e-10) if deviation else None)


def test_overflowing_removed_moments_do_not_become_zero_deviation():
    source = {
        "kind": "series",
        "name": "derived extremes",
        "unit": "m",
        "points": [
            {"timestampMs": i, "value": value, "status": "valid"}
            for i, value in enumerate([1e200, -1e200, 0.0, 1.0])
        ],
    }
    # Removing an extreme from overflowing moments produces NaN. Clamping NaN
    # with max(0, variance) would turn that undefined result into a valid zero.
    result = rolling_points(source, 3, 2, "std", lambda: None)
    assert result[-1]["status"] == "undefined"
    assert result[-1]["value"] is None
