import copy
import json
import math
from pathlib import Path

import pytest

from streamweave_engine.cache import NodeCache, encoded
from streamweave_engine.context import Context
from streamweave_engine.executor import execute
from streamweave_engine.statistics import regression

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[3] / ".local" / "engine-fixtures.json").read_text(
        encoding="utf-8"
    )
)


def equivalent(actual, expected, path="root"):
    if path.rsplit(".", 1)[-1] in ("timestampMs", "availableAtMs", "sampleCount"):
        assert actual == expected, (path, actual, expected)
    elif type(expected) in (int, float):
        assert type(actual) in (int, float), (path, type(actual))
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
    for node in result["nodes"].values():
        node.pop("key", None)  # Transport/cache identity is not part of the numerical contract.
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
    outputs = execute(FIXTURES[0]["project"])["nodes"]["alignment"]["outputs"]
    size = len(encoded(outputs))
    cache = NodeCache(max_bytes=size * 2, max_memory_bytes=size)
    cache.put("large_objects", outputs, size)
    assert cache.get("large_objects") is None  # Object overhead exceeds its compact JSON size.
    cache = NodeCache(max_bytes=size)
    cache.put("first", outputs, size)
    cache.put("second", outputs, size)
    assert cache.get("first") is None
    assert cache.get("second").outputs is outputs


def test_regression_coefficients_and_in_sample_availability():
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
