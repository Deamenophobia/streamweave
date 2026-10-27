"""Stable transport errors; calculation diagnostics stay attached to their node."""

from typing import Literal

type ErrorCode = Literal[
    "invalid_request",
    "invalid_project",
    "contracts_mismatch",
    "datasets_missing",
    "capacity",
    "cancelled",
    "timeout",
    "job_missing",
    "internal_error",
]


class EngineError(Exception):
    def __init__(self, code: ErrorCode, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.status = status


class Cancelled(EngineError):
    def __init__(self) -> None:
        super().__init__("cancelled", "Calculation cancelled.")
