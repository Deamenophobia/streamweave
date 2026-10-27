"""Loopback HTTP boundary: validate uploads once, submit typed graphs, serve deltas."""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast
from uuid import UUID

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.middleware.base import RequestResponseEndpoint

from . import VERSION
from .catalogue import CONTRACT_HASH, MODULES
from .contracts import Graph
from .errors import EngineError
from .jobs import Jobs
from .models import JobRequest, read_datasets

ORIGINS = [f"http://{host}:{port}" for host in ("127.0.0.1", "localhost") for port in (5187, 5188)]
MAX_REQUEST_BYTES = 15_000_000


def create_app() -> FastAPI:
    jobs = Jobs()

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        jobs.start()
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
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-Streamweave-Protocol", "X-Streamweave-Session"],
    )

    @app.exception_handler(EngineError)
    async def engine_error(_request: Request, error: EngineError) -> JSONResponse:
        return error_response(error)

    @app.middleware("http")
    async def local_only(request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.headers.get("host") not in ("127.0.0.1:5191", "localhost:5191"):
            return error_response(
                EngineError("invalid_request", "Only the local host is accepted.", 403)
            )
        origin = request.headers.get("origin")
        if origin is not None and origin not in ORIGINS:
            return error_response(EngineError("invalid_request", "Origin is not allowed.", 403))
        if request.method != "OPTIONS" and request.headers.get("x-streamweave-protocol") != "2":
            return error_response(
                EngineError(
                    "contracts_mismatch",
                    "Update the app and engine together: protocol 2 is required.",
                )
            )
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/v2/capabilities")
    def capabilities() -> dict[str, object]:
        return {
            "protocolVersion": 2,
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

    @app.put("/v2/datasets/{bundle_id}", status_code=204)
    async def upload(bundle_id: str, request: Request) -> Response:
        session = session_id(request)
        data = await read_json(request, MAX_REQUEST_BYTES)
        try:
            bundle = read_datasets(str(UUID(bundle_id)), data)
        except (ValueError, TypeError) as error:
            raise EngineError("invalid_project", "Invalid dataset document.") from error
        jobs.upload(session, bundle)
        return Response(status_code=204)

    @app.post("/v2/jobs", status_code=202)
    async def submit(request: Request) -> dict[str, object]:
        session = session_id(request)
        data = await read_json(request, 1_000_000)
        try:
            document = JobRequest.model_validate(data)
        except ValidationError as error:
            raise EngineError("invalid_request", "Invalid graph or job request.") from error
        if document.contractHash != CONTRACT_HASH:
            raise EngineError(
                "contracts_mismatch", "Update the app and engine together: module contracts differ."
            )
        graph = cast(Graph, document.graph.model_dump(exclude_unset=True))
        jobs.submit(document.jobId, session, graph, document.bundleId, document.knownResults)
        return {"protocolVersion": 2, "jobId": document.jobId}

    @app.get("/v2/jobs/{job_id}")
    def status(job_id: str, request: Request) -> JSONResponse:
        return JSONResponse(jobs.snapshot(job_id, session_id(request)))

    @app.get("/v2/jobs/{job_id}/result")
    def result(job_id: str, request: Request) -> JSONResponse:
        return JSONResponse(jobs.result(job_id, session_id(request)))

    @app.delete("/v2/jobs/{job_id}", status_code=204)
    def cancel(job_id: str, request: Request) -> Response:
        jobs.remove(job_id, session_id(request))
        return Response(status_code=204)

    return app


def error_response(error: EngineError) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": error.code, "message": str(error)}}, status_code=error.status
    )


async def read_json(request: Request, limit: int) -> object:
    if request.headers.get("content-type", "").split(";")[0] != "application/json":
        raise EngineError("invalid_request", "Send application/json.", 415)
    chunks, size = [], 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > limit:
            raise EngineError("invalid_request", f"Request exceeds {limit} bytes.", 413)
        chunks.append(chunk)
    try:
        return json.loads(b"".join(chunks), parse_constant=reject_constant)
    except (ValueError, RecursionError) as error:
        raise EngineError("invalid_request", "Invalid JSON document.") from error


def reject_constant(value: str) -> None:
    raise ValueError(f"Non-finite JSON number: {value}.")


def session_id(request: Request) -> str:
    try:
        return str(UUID(request.headers.get("x-streamweave-session", "")))
    except ValueError as error:
        raise EngineError("invalid_request", "A valid session identifier is required.") from error


app = create_app()
