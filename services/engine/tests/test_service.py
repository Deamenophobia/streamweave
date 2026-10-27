import copy
import json
import time
from pathlib import Path
from threading import Event
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from streamweave_engine.catalogue import CONTRACT_HASH
from streamweave_engine.jobs import Job, Jobs
from streamweave_engine.server import create_app

PROJECT = json.loads(
    (Path(__file__).resolve().parents[3] / ".local" / "engine-fixtures.json").read_text(
        encoding="utf-8"
    )
)[0]["project"]


@pytest.fixture
def client():
    headers = {
        "X-Streamweave-Protocol": "1",
        "X-Streamweave-Session": str(uuid4()),
        "Origin": "http://127.0.0.1:5187",
    }
    with TestClient(create_app(), base_url="http://127.0.0.1:5191", headers=headers) as connection:
        yield connection


def payload(project=PROJECT):
    return {
        "protocolVersion": 1,
        "contractHash": CONTRACT_HASH,
        "jobId": str(uuid4()),
        "project": project,
    }


def wait_result(client, job_id):
    for _ in range(300):
        response = client.get(f"/v1/jobs/{job_id}")
        assert response.status_code == 200
        state = response.json()
        if state["state"] != "running":
            return state
        time.sleep(0.01)
    raise AssertionError("Job did not finish")


def test_round_trip_and_release(client):
    capabilities = client.get("/v1/capabilities").json()
    assert len(capabilities["modules"]) == 15
    assert capabilities["contractHash"] == CONTRACT_HASH
    request = payload()
    assert client.post("/v1/jobs", json=request).status_code == 202
    result = wait_result(client, request["jobId"])
    assert result["state"] == "completed"
    assert result["progress"] == {"completed": 9, "total": 9}
    assert result["result"]["nodes"]["fit"]["state"] == "ready"
    assert (
        client.get(
            f"/v1/jobs/{request['jobId']}", headers={"X-Streamweave-Session": str(uuid4())}
        ).status_code
        == 404
    )
    assert client.delete(f"/v1/jobs/{request['jobId']}").status_code == 204
    assert client.get(f"/v1/jobs/{request['jobId']}").status_code == 404
    request = payload()
    assert client.post("/v1/jobs", json=request).status_code == 202
    assert wait_result(client, request["jobId"])["result"]["metrics"]["cacheHits"] == 9


def test_rejects_untrusted_origins_hosts_protocol_and_large_bodies(client):
    assert (
        client.get("/v1/capabilities", headers={"Origin": "https://untrusted.example"}).status_code
        == 403
    )
    assert client.get("/v1/capabilities", headers={"Host": "untrusted.example"}).status_code == 403
    assert (
        client.get("/v1/capabilities", headers={"X-Streamweave-Protocol": "2"}).status_code == 400
    )
    bad = payload()
    bad["contractHash"] = "old"
    assert client.post("/v1/jobs", json=bad).status_code == 400
    for key, value in (("jobId", {}), ("jobId", 1), ("protocolVersion", True)):
        bad = {**payload(), key: value}
        assert client.post("/v1/jobs", json=bad).status_code == 400
    assert (
        client.post(
            "/v1/jobs", content="x" * 15_000_001, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )
    assert (
        client.post(
            "/v1/jobs", content='{"value":NaN}', headers={"Content-Type": "application/json"}
        ).status_code
        == 400
    )
    preflight = client.options(
        "/v1/jobs",
        headers={
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-streamweave-protocol,x-streamweave-session",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://127.0.0.1:5187"


def test_invalid_project_is_a_job_failure_without_echoing_data(client):
    project = copy.deepcopy(PROJECT)
    project["datasets"][0]["rows"][0]["reading"] = "PRIVATE_FIXTURE_VALUE"
    request = payload(project)
    assert client.post("/v1/jobs", json=request).status_code == 202
    result = wait_result(client, request["jobId"])
    assert result["state"] == "failed"
    assert "PRIVATE_FIXTURE_VALUE" not in json.dumps(result)


def test_cancellation_releases_running_job_and_bounds_concurrency(monkeypatch):
    entered, release = Event(), Event()

    def controlled(_project, _cache, checkpoint, _progress):
        entered.set()
        assert release.wait(3)
        checkpoint()
        return {}

    monkeypatch.setattr("streamweave_engine.jobs.execute", controlled)
    jobs = Jobs()
    try:
        jobs.submit("a", "session", PROJECT)
        assert entered.wait(2)
        jobs.submit("b", "session", PROJECT)
        with pytest.raises(OverflowError):
            jobs.submit("c", "session", PROJECT)
        jobs.remove("a", "session")
        release.set()
        for _ in range(200):
            if jobs.snapshot("a", "session") is None:
                break
            time.sleep(0.01)
        assert jobs.snapshot("a", "session") is None
    finally:
        release.set()
        jobs.close()


def test_retention_starts_at_completion_not_submission(monkeypatch):
    monkeypatch.setattr("streamweave_engine.jobs.time.monotonic", lambda: 100.0)
    jobs = Jobs()
    try:
        jobs.jobs["long"] = Job(session="s", created=0, state="completed", finished=90)
        jobs.jobs["old"] = Job(session="s", created=0, state="completed", finished=30)
        jobs.jobs["active"] = Job(session="s", created=0)
        assert jobs.snapshot("long", "s")["state"] == "completed"
        assert jobs.snapshot("old", "s") is None
        assert jobs.snapshot("active", "s")["state"] == "running"
    finally:
        jobs.close()
