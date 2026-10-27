"""Bounded jobs, cooperative deadlines, periodic cleanup, and session ownership."""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from threading import Event, Lock, Thread
from typing import Literal

from .cache import NodeCache
from .contracts import DatasetBundle, Graph, RunResult, Study
from .errors import Cancelled, EngineError, ErrorCode
from .executor import execute_study
from .sessions import Sessions
from .transport import result_payload

logger = logging.getLogger(__name__)
type JobState = Literal["running", "completed", "failed", "cancelled"]


@dataclass
class Job:
    session: str
    study: Study
    known: dict[str, str]
    created: float = field(default_factory=time.monotonic)
    cancel: Event = field(default_factory=Event)
    state: JobState = "running"
    completed: int = 0
    result: RunResult | None = None
    error_code: ErrorCode | None = None
    error_message: str = ""
    released: bool = False
    finished: float | None = None

    def checkpoint(self) -> None:
        if self.cancel.is_set():
            raise Cancelled()
        if time.monotonic() - self.created > 120:
            raise EngineError("timeout", "Calculation exceeded the 120-second limit.")


class Jobs:
    def __init__(self) -> None:
        self.lock = Lock()
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="streamweave")
        self.jobs: dict[str, Job] = {}
        self.sessions = Sessions()
        self.stopping = Event()
        self.cleaner: Thread | None = None

    def start(self) -> None:
        self.cleaner = Thread(target=self._clean_idle, name="streamweave-cleanup", daemon=True)
        self.cleaner.start()

    def _active_sessions(self) -> set[str]:
        return {job.session for job in self.jobs.values() if job.state == "running"}

    def upload(self, session: str, bundle: DatasetBundle) -> None:
        with self.lock:
            if self.stopping.is_set():
                raise EngineError("capacity", "Engine is shutting down.", 503)
            self.sessions.get(session, self._active_sessions(), create=True).bundle = bundle

    def submit(
        self,
        job_id: str,
        session_id: str,
        graph: Graph,
        bundle_id: str,
        known: dict[str, str],
    ) -> None:
        with self.lock:
            if self.stopping.is_set():
                raise EngineError("capacity", "Engine is shutting down.", 503)
            if job_id in self.jobs:
                raise EngineError("invalid_request", "Job ID already exists.")
            if sum(j.state == "running" for j in self.jobs.values()) >= 2 or len(self.jobs) >= 4:
                raise EngineError(
                    "capacity", "Engine is busy. Cancel or wait before retrying.", 429
                )
            session = self.sessions.get(session_id, self._active_sessions())
            if session.bundle is None or session.bundle.id != bundle_id:
                raise EngineError(
                    "datasets_missing", "The dataset session expired. Upload again.", 409
                )
            job = Job(session_id, Study(graph, session.bundle), known)
            self.jobs[job_id] = job
            self.pool.submit(self._run, job_id, job, session.cache)

    def cleanup(self) -> None:
        with self.lock:
            now = time.monotonic()
            expired = [
                key
                for key, job in self.jobs.items()
                if job.finished is not None and now - job.finished > 60
            ]
            for key in expired:
                del self.jobs[key]
            self.sessions.expire(now, self._active_sessions())

    def _clean_idle(self) -> None:
        while not self.stopping.wait(5):
            self.cleanup()

    def _run(self, key: str, job: Job, cache: NodeCache) -> None:
        def progress(completed: int, _total: int) -> None:
            with self.lock:
                job.completed = completed

        try:
            result = execute_study(job.study, cache, job.checkpoint, progress)
            with self.lock:
                job.checkpoint()
                job.result, job.state = result, "completed"
        except EngineError as error:
            with self.lock:
                job.state = "cancelled" if error.code == "cancelled" else "failed"
                job.error_code, job.error_message = error.code, str(error)
        except ValueError as error:
            with self.lock:
                job.state, job.error_code, job.error_message = (
                    "failed",
                    "invalid_project",
                    str(error),
                )
        except Exception as error:
            logger.error("job %s failed (%s)", key, type(error).__name__)
            with self.lock:
                job.state, job.error_code = "failed", "internal_error"
                job.error_message = "Calculation failed inside the engine."
        finally:
            with self.lock:
                job.finished = time.monotonic()
                if job.released:
                    self.jobs.pop(key, None)

    def _find(self, key: str, session: str) -> Job:
        job = self.jobs.get(key)
        if job is None or job.session != session or job.released:
            raise EngineError("job_missing", "Job was released or expired. Run again.", 404)
        return job

    def snapshot(self, key: str, session: str) -> dict[str, object]:
        with self.lock:
            job = self._find(key, session)
            result: dict[str, object] = {
                "protocolVersion": 2,
                "jobId": key,
                "state": job.state,
                "progress": {"completed": job.completed, "total": len(job.study.graph["nodes"])},
            }
            if job.error_code:
                result["error"] = {"code": job.error_code, "message": job.error_message}
            return result

    def result(self, key: str, session: str) -> dict[str, object]:
        with self.lock:
            job = self._find(key, session)
            if job.state != "completed" or job.result is None:
                raise EngineError("invalid_request", "Result is not ready.", 409)
            return result_payload(job.result, job.study, job.known)

    def remove(self, key: str, session: str) -> None:
        with self.lock:
            job = self.jobs.get(key)
            if job is None or job.session != session:
                return
            job.cancel.set()
            job.released = True
            if job.state != "running":
                del self.jobs[key]

    def close(self) -> None:
        self.stopping.set()
        if self.cleaner:
            self.cleaner.join()
        with self.lock:
            for job in self.jobs.values():
                job.cancel.set()
        self.pool.shutdown(wait=True, cancel_futures=True)
        self.jobs.clear()
        self.sessions.clear()
