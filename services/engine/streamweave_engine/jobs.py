"""Bounded in-memory jobs. Cancellation is checked between nodes and numerical chunks."""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from threading import Event, Lock

from .cache import NodeCache
from .executor import Cancelled, execute


@dataclass
class Job:
    session: str
    created: float = field(default_factory=time.monotonic)
    cancel: Event = field(default_factory=Event)
    state: str = "running"
    completed: int = 0
    total: int = 0
    result: dict | None = None
    error: str = ""
    released: bool = False
    finished: float | None = None

    def checkpoint(self):
        if self.cancel.is_set():
            raise Cancelled()
        if time.monotonic() - self.created > 120:
            raise ValueError("Calculation exceeded the 120-second limit.")


class Jobs:
    def __init__(self):
        self.lock = Lock()
        self.pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="streamweave")
        self.jobs: dict[str, Job] = {}
        self.caches: dict[str, NodeCache] = {}

    def submit(self, job_id, session, project):
        with self.lock:
            self._prune()
            if job_id in self.jobs:
                raise ValueError("Job ID already exists.")
            if sum(j.state == "running" for j in self.jobs.values()) >= 2:
                raise OverflowError(
                    "Two calculations are already running. Cancel or wait before retrying."
                )
            if len(self.jobs) >= 4:
                raise OverflowError(
                    "Result capacity reached. Release an earlier result before retrying."
                )
            if session not in self.caches:
                if len(self.caches) >= 2:
                    active = {j.session for j in self.jobs.values() if j.state == "running"}
                    disposable = next((s for s in self.caches if s not in active), None)
                    if disposable is None:
                        raise OverflowError("Engine session capacity reached.")
                    del self.caches[disposable]
                self.caches[session] = NodeCache()
            job = Job(session=session, total=len(project.get("graph", {}).get("nodes", [])))
            self.jobs[job_id] = job
            self.pool.submit(self._run, job, project, self.caches[session])

    def _prune(self):
        expired = [
            key
            for key, job in self.jobs.items()
            if job.finished is not None and time.monotonic() - job.finished > 60
        ]
        for key in expired:
            del self.jobs[key]

    def _run(self, job, project, cache):
        def progress(completed, total):
            with self.lock:
                job.completed, job.total = completed, total

        try:
            result = execute(project, cache, job.checkpoint, progress)
            with self.lock:
                job.checkpoint()
                job.result, job.state = result, "completed"
        except Cancelled:
            with self.lock:
                job.state, job.result = "cancelled", None
        except Exception as error:
            with self.lock:
                # Keep source values out of HTTP errors (Pydantic errors can include input rows).
                job.error = (
                    "Invalid project document."
                    if type(error).__name__ == "ValidationError"
                    else str(error)
                )
                job.state = "failed"
        finally:
            with self.lock:
                job.finished = time.monotonic()
                if job.released:
                    for key in [key for key, value in self.jobs.items() if value is job]:
                        del self.jobs[key]

    def snapshot(self, job_id, session):
        with self.lock:
            self._prune()
            job = self.jobs.get(job_id)
            if job is None or job.session != session:
                return None
            result = {
                "protocolVersion": 1,
                "jobId": job_id,
                "state": job.state,
                "progress": {"completed": job.completed, "total": job.total},
            }
            if job.result is not None:
                result["result"] = job.result
            if job.error:
                result["error"] = job.error
            return result

    def remove(self, job_id, session):
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None or job.session != session:
                return
            job.cancel.set()
            job.released = True
            if job.state != "running":
                del self.jobs[job_id]

    def close(self):
        with self.lock:
            for job in self.jobs.values():
                job.cancel.set()
        self.pool.shutdown(wait=True, cancel_futures=True)
        self.jobs.clear()
        self.caches.clear()
