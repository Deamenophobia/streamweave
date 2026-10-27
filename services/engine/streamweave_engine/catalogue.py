"""Generated, language-neutral ports and parameter contracts."""

import hashlib
import json
from pathlib import Path
from typing import NotRequired, TypedDict, cast

from .contracts import Params


class Port(TypedDict):
    id: str
    label: str
    accepts: list[str]
    minimum: NotRequired[int]
    multiple: NotRequired[bool]


class Option(TypedDict):
    value: str


class DependentMaximum(TypedDict):
    parameter: str


class Parameter(TypedDict):
    key: str
    kind: str
    options: NotRequired[list[Option]]
    min: NotRequired[float]
    max: NotRequired[float | DependentMaximum]
    integer: NotRequired[bool]


class Module(TypedDict):
    inputs: list[Port]
    outputs: list[Port]
    parameters: list[Parameter]


_path = Path(__file__).resolve().parents[3] / "protocol" / "modules.json"
_bytes = _path.read_bytes().replace(b"\r\n", b"\n")
CATALOGUE = json.loads(_bytes)
MODULES = cast(dict[str, Module], CATALOGUE["modules"])
CONTRACT_HASH = hashlib.sha256(_bytes).hexdigest()


def validate_parameters(kind: str, params: Params) -> None:
    for field in MODULES[kind]["parameters"]:
        value = params.get(field["key"])
        if field["kind"] == "choice":
            if value not in [option["value"] for option in field["options"]]:
                raise ValueError(f"Unknown {field['key']}: {value}.")
        if field["kind"] != "number":
            if value is not None and not isinstance(value, str):
                raise ValueError(f"{field['key']} must be text.")
            continue
        limit = field["max"]
        maximum = params.get(limit["parameter"]) if isinstance(limit, dict) else limit
        if not isinstance(value, (int, float)) or not isinstance(maximum, (int, float)):
            raise ValueError(f"{field['key']} must be a finite number.")
        if not field["min"] <= value <= maximum:
            raise ValueError(f"{field['key']} must be from {field['min']} to {maximum}.")
        if field.get("integer") and value != int(value):
            raise ValueError(f"{field['key']} must be an integer.")
