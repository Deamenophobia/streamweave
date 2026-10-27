"""Loopback-only HTTP adapter. No file paths, scripts, or remote data are accepted."""

import json
from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import VERSION
from .catalogue import CONTRACT_HASH, MODULES
from .jobs import Jobs

ORIGINS = [f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5187, 5188)]
MAX_REQUEST_BYTES = 15_000_000


def create_app():
    jobs = Jobs()

    @asynccontextmanager
    async def lifespan(_app):
        yield
        jobs.close()

    app = FastAPI(
        title="Streamweave local engine",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ORIGINS,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type", "X-Streamweave-Protocol", "X-Streamweave-Session"],
    )

    @app.middleware("http")
    async def local_only(request, call_next):
        if request.headers.get("host") not in ("127.0.0.1:5191", "localhost:5191"):
            return JSONResponse(
                {"detail": "Only the local engine host is accepted."}, status_code=403
            )
        origin = request.headers.get("origin")
        if origin is not None and origin not in ORIGINS:
            return JSONResponse({"detail": "Origin is not allowed."}, status_code=403)
        if request.method != "OPTIONS" and request.headers.get("x-streamweave-protocol") != "1":
            return JSONResponse({"detail": "Protocol version 1 is required."}, status_code=400)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/v1/capabilities")
    def capabilities():
        return {
            "protocolVersion": 1,
            "engine": "python",
            "version": VERSION,
            "contractHash": CONTRACT_HASH,
            "modules": list(MODULES),
            "limits": {
                "datasetRows": 20_000,
                "projectRows": 50_000,
                "requestBytes": MAX_REQUEST_BYTES,
            },
        }

    @app.post("/v1/jobs", status_code=202)
    async def submit(request: Request):
        session = session_id(request)
        if request.headers.get("content-type", "").split(";")[0] != "application/json":
            raise HTTPException(415, "Send application/json.")
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_REQUEST_BYTES:
                raise HTTPException(413, "Project exceeds 15 MB.")
            chunks.append(chunk)
        try:
            data = json.loads(b"".join(chunks), parse_constant=reject_constant)
            if (
                not isinstance(data, dict)
                or type(data.get("protocolVersion")) is not int
                or data.get("protocolVersion") != 1
                or data.get("contractHash") != CONTRACT_HASH
            ):
                raise ValueError(
                    "Engine contracts do not match. Update the app and local engine together."
                )
            if not isinstance(data.get("jobId"), str):
                raise ValueError("A job identifier is required.")
            job_id = str(UUID(data["jobId"]))
            if not isinstance(data.get("project"), dict) or not isinstance(
                data["project"].get("graph"), dict
            ):
                raise ValueError("A project document is required.")
            jobs.submit(job_id, session, data["project"])
        except OverflowError as error:
            raise HTTPException(429, str(error)) from error
        except (ValueError, KeyError, TypeError, RecursionError) as error:
            raise HTTPException(400, "Invalid request or incompatible module contracts.") from error
        return {"protocolVersion": 1, "jobId": job_id}

    @app.get("/v1/jobs/{job_id}")
    def status(job_id: str, request: Request):
        snapshot = jobs.snapshot(job_id, session_id(request))
        if snapshot is None:
            raise HTTPException(404, "Job was released or expired. Run the study again.")
        # The engine already emits JSON-safe primitives; avoid a second recursive encoding pass.
        return JSONResponse(snapshot)

    @app.delete("/v1/jobs/{job_id}", status_code=204)
    def cancel(job_id: str, request: Request):
        jobs.remove(job_id, session_id(request))

    return app


def reject_constant(value):
    raise ValueError(f"Non-finite JSON number: {value}.")


def session_id(request):
    try:
        return str(UUID(request.headers.get("x-streamweave-session", "")))
    except ValueError as error:
        raise HTTPException(400, "A valid session identifier is required.") from error


app = create_app()
