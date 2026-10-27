import copy
import json
import math
from pathlib import Path

import pytest

from streamweave_engine.cache import NodeCache
from streamweave_engine.context import Context
from streamweave_engine.executor import Cancelled, execute
from streamweave_engine.statistics import regression, rolling

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[3] / ".local" / "engine-fixtures.json").read_text(
        encoding="utf-8"
    )
)


def equivalent(actual, expected, path="root"):
    if type(expected) in (int, float):
        assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9), (path, actual, expected)
    elif isinstance(expected, dict):
        assert actual.keys() == expected.keys(), (path, actual.keys(), expected.keys())
        for key, value in expected.items():
            if key != "error":  # User-facing diagnostics may differ; states and outputs must agree.
                equivalent(actual[key], value, f"{path}.{key}")
    elif isinstance(expected, list):
        assert len(actual) == len(expected), (path, len(actual), len(expected))
        for index, (left, right) in enumerate(zip(actual, expected, strict=True)):
            equivalent(left, right, f"{path}[{index}]")
    else:
        assert actual == expected, (path, actual, expected)


@pytest.mark.parametrize("fixture", FIXTURES, ids=lambda f: f["name"])
def test_matches_typescript(fixture):
    result = execute(fixture["project"])
    equivalent({"nodes": result["nodes"], "order": result["order"]}, fixture["expected"])


def test_cache_reuses_unchanged_branches_and_invalidates_changes():
    project = copy.deepcopy(FIXTURES[0]["project"])
    cache = NodeCache()
    first = execute(project, cache)
    assert first["metrics"]["cacheHits"] == 0
    assert execute(project, cache)["metrics"]["cacheHits"] == 9
    project["graph"]["name"] = "Renamed"
    project["graph"]["nodes"][0]["position"]["x"] = 999
    assert execute(project, cache)["metrics"]["cacheHits"] == 9
    project["graph"]["nodes"][3]["params"]["window"] = 8
    edited = execute(project, cache)
    assert edited["metrics"]["cacheHits"] == 7
    assert edited["nodes"]["correlation"] != first["nodes"]["correlation"]
    project["datasets"][0]["rows"][1]["reading"] += 2
    assert execute(project, cache)["metrics"]["cacheHits"] == 1


def test_lru_has_a_payload_budget():
    cache = NodeCache(max_bytes=10)
    cache.put("a", {}, 6)
    cache.put("b", {}, 6)
    assert cache.get("a") is None
    assert cache.get("b") == ({}, 6)
    cache.put("too_big", {}, 11)
    assert cache.bytes == 6


def test_cancellation_stops_before_execution():
    def cancelled():
        raise Cancelled()

    with pytest.raises(Cancelled):
        execute(FIXTURES[0]["project"], checkpoint=cancelled)


@pytest.mark.parametrize(
    "mutation",
    [
        lambda p: p.update(version=3),
        lambda p: p["datasets"][0]["rows"][0].update(reading=float("nan")),
        lambda p: p["datasets"][0]["rows"][0].update(timestampMs=True),
        lambda p: p["graph"]["nodes"].append(p["graph"]["nodes"][0]),
        lambda p: p["graph"]["edges"][0].update(sourcePort="missing"),
        lambda p: p["graph"]["edges"].append(p["graph"]["edges"][0]),
    ],
)
def test_rejects_invalid_documents(mutation):
    project = copy.deepcopy(FIXTURES[0]["project"])
    mutation(project)
    with pytest.raises(ValueError):
        execute(project)


def test_independent_analytical_regression_and_sample_deviation():
    frame = {
        "kind": "frame",
        "columns": [{"key": k, "label": k, "unit": "m", "type": "number"} for k in ("x", "y")],
        "rows": [
            {
                "timestampMs": i,
                "values": {"x": i, "y": 2 * i + 3},
                "statuses": {"x": "valid", "y": "valid"},
            }
            for i in range(1, 6)
        ],
    }
    context = Context(
        {"params": {"x": "x", "y": "y"}},
        [{"edge": {"targetPort": "frame"}, "data": frame}],
        {},
        lambda: None,
    )
    output = regression(context)
    values = {row["statistic"]: row["value"] for row in output["model"]["rows"]}
    assert values["slope"] == pytest.approx(2)
    assert values["intercept"] == pytest.approx(3)
    assert values["R squared (in sample)"] == pytest.approx(1)
    assert all(p["availableAtMs"] == 5 for p in output["residuals"]["points"])
    source = {
        "name": "x",
        "unit": "m",
        "kind": "series",
        "points": [
            {"timestampMs": i, "value": v, "status": "valid"} for i, v in enumerate([2, 4, 6])
        ],
    }
    context = Context(
        {"params": {"window": 3, "minimum": 1, "operation": "std"}},
        [{"edge": {"targetPort": "series"}, "data": source}],
        {},
        lambda: None,
    )
    points = rolling(context)["series"]["points"]
    assert points[0]["status"] == "undefined"
    assert points[-1]["value"] == pytest.approx(2)
