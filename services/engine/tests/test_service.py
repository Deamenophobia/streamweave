import copy
import json
import time
from pathlib import Path
from threading import Event
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from streamweave_engine.cache import encoded
from streamweave_engine.catalogue import CONTRACT_HASH
from streamweave_engine.errors import EngineError
from streamweave_engine.jobs import Jobs
from streamweave_engine.models import read_project
from streamweave_engine.server import create_app

FIXTURES = json.loads(
    (Path(__file__).resolve().parents[3] / ".local/engine-fixtures.json").read_text(
        encoding="utf-8"
    )
)
PROJECT = FIXTURES[0]["project"]


@pytest.fixture
def client():
    headers = {
        "X-Streamweave-Protocol": "2",
        "X-Streamweave-Session": str(uuid4()),
        "Origin": "http://127.0.0.1:5187",
    }
    with TestClient(create_app(), base_url="http://127.0.0.1:5191", headers=headers) as connection:
        yield connection


def upload(client, project=PROJECT):
    bundle = str(uuid4())
    assert client.put(f"/v2/datasets/{bundle}", json=project["datasets"]).status_code == 204
    return bundle


def submit(client, bundle, graph=PROJECT["graph"], known=None):
    payload = {
        "protocolVersion": 2,
        "contractHash": CONTRACT_HASH,
        "jobId": str(uuid4()),
        "bundleId": bundle,
        "graph": graph,
        "knownResults": known or {},
    }
    response = client.post("/v2/jobs", json=payload)
    assert response.status_code == 202, response.text
    return payload["jobId"]


def result(client, key):
    for _ in range(300):
        snapshot = client.get(f"/v2/jobs/{key}")
        assert snapshot.status_code == 200
        state = snapshot.json()
        assert "result" not in state  # Polling never retransmits data rows.
        if state["state"] == "completed":
            return client.get(f"/v2/jobs/{key}/result").json()
        assert state["state"] == "running", state
        time.sleep(0.01)
    raise AssertionError("Job did not finish")


def test_dataset_reuse_incremental_results_and_branch_invalidation(client, monkeypatch):
    from streamweave_engine import server

    original, uploads = server.read_datasets, []

    def counted(key, data):
        uploads.append(key)
        return original(key, data)

    monkeypatch.setattr(server, "read_datasets", counted)
    bundle = upload(client)
    first_key = submit(client, bundle)
    first = result(client, first_key)
    assert first["nodes"]["source_a"]["sourceDataset"] == PROJECT["datasets"][0]["id"]
    assert "data" not in first["nodes"]["source_a"]["outputs"]
    known = {key: node["key"] for key, node in first["nodes"].items()}
    client.delete(f"/v2/jobs/{first_key}")
    second_key = submit(client, bundle, known=known)
    second = result(client, second_key)
    assert second["metrics"]["cacheHits"] == 9
    assert all(node["reused"] for node in second["nodes"].values())
    assert len(encoded(second)) < len(encoded(first)) / 5
    graph = copy.deepcopy(PROJECT["graph"])
    next(n for n in graph["nodes"] if n["id"] == "correlation")["params"]["window"] = 8
    changed_key = submit(client, bundle, graph, known)
    changed = result(client, changed_key)
    assert changed["metrics"]["cacheHits"] == 7
    assert "outputs" in changed["nodes"]["correlation"]
    assert changed["nodes"]["fit"]["reused"]
    assert uploads == [bundle]  # Graph edits never revalidate source rows.
    assert (
        client.get(
            f"/v2/jobs/{second_key}/result", headers={"X-Streamweave-Session": str(uuid4())}
        ).status_code
        == 404
    )
    client.delete(f"/v2/jobs/{second_key}")
    assert client.get(f"/v2/jobs/{second_key}").status_code == 404


def test_external_boundary_rejects_invalid_data_without_echoing_cells(client):
    assert (
        client.get("/v2/capabilities", headers={"Origin": "https://untrusted.example"}).status_code
        == 403
    )
    assert client.get("/v2/capabilities", headers={"Host": "untrusted.example"}).status_code == 403
    assert (
        client.get("/v2/capabilities", headers={"X-Streamweave-Protocol": "1"}).status_code == 400
    )
    path = f"/v2/datasets/{uuid4()}"
    data = copy.deepcopy(PROJECT["datasets"])
    data[0]["rows"][0]["reading"] = "PRIVATE_FIXTURE_VALUE"
    rejected = client.put(path, json=data)
    assert rejected.status_code == 400 and "PRIVATE_FIXTURE_VALUE" not in rejected.text
    assert (
        client.put(path, content="[NaN]", headers={"Content-Type": "application/json"}).status_code
        == 400
    )
    assert (
        client.put(
            path, content="x" * 15_000_001, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    missing = client.post(
        "/v2/jobs",
        json={
            "protocolVersion": 2,
            "contractHash": CONTRACT_HASH,
            "jobId": str(uuid4()),
            "bundleId": str(uuid4()),
            "graph": PROJECT["graph"],
        },
    )
    assert missing.status_code == 409 and missing.json()["error"]["code"] == "datasets_missing"
    preflight = client.options(
        path,
        headers={
            "Access-Control-Request-Method": "PUT",
            "Access-Control-Request-Headers": "content-type,x-streamweave-protocol,x-streamweave-session",
        },
    )
    assert preflight.status_code == 200


def test_real_rolling_job_cancellation_and_capacity(monkeypatch):
    from streamweave_engine import statistics

    original = statistics.rolling_points
    entered, release = Event(), Event()

    def controlled(source, width, minimum, operation, checkpoint):
        calls = 0

        def pause_after_chunk():
            nonlocal calls
            calls += 1
            if calls == 2:
                entered.set()
                assert release.wait(3)
            checkpoint()

        return original(source, width, minimum, operation, pause_after_chunk)

    monkeypatch.setattr(statistics, "rolling_points", controlled)
    study = read_project(
        next(f["project"] for f in FIXTURES if f["name"] == "vectorized chunk boundaries")
    )
    jobs = Jobs()
    try:
        jobs.upload("s", study.bundle)
        jobs.submit("a", "s", study.graph, study.bundle.id, {})
        assert entered.wait(3)
        jobs.submit("b", "s", study.graph, study.bundle.id, {})
        with pytest.raises(EngineError, match="busy"):
            jobs.submit("c", "s", study.graph, study.bundle.id, {})
        jobs.remove("a", "s")
        release.set()
        for _ in range(300):
            if "a" not in jobs.jobs:
                break
            time.sleep(0.01)
        assert "a" not in jobs.jobs
        with pytest.raises(EngineError) as rejected:
            jobs.result("a", "s")
        assert rejected.value.code == "job_missing"
    finally:
        release.set()
        jobs.close()


def test_idle_cleanup_releases_results_and_datasets_without_another_request():
    study = read_project(PROJECT)
    jobs = Jobs()
    try:
        jobs.upload("s", study.bundle)
        jobs.submit("a", "s", study.graph, study.bundle.id, {})
        for _ in range(300):
            if jobs.jobs["a"].finished is not None:
                break
            time.sleep(0.01)
        # A long calculation retains its result for 60 seconds after completion.
        jobs.jobs["a"].created -= 100
        jobs.cleanup()
        assert jobs.snapshot("a", "s")["state"] == "completed"
        jobs.jobs["a"].finished = time.monotonic() - 61
        jobs.sessions.entries["s"].touched -= 301
        jobs.start()
        for _ in range(120):
            if not jobs.jobs and not jobs.sessions.entries:
                break
            time.sleep(0.05)
        assert not jobs.jobs and not jobs.sessions.entries
    finally:
        jobs.close()
