"""Generated, language-neutral ports and parameter contracts."""

import hashlib
import json
from pathlib import Path

_path = Path(__file__).resolve().parents[3] / "protocol" / "modules.json"
_bytes = _path.read_bytes().replace(b"\r\n", b"\n")
CATALOGUE = json.loads(_bytes)
MODULES = CATALOGUE["modules"]
CONTRACT_HASH = hashlib.sha256(_bytes).hexdigest()


def validate_parameters(kind: str, params: dict) -> None:
    for field in MODULES[kind]["parameters"]:
        value = params.get(field["key"])
        if field["kind"] == "choice":
            if value not in [option["value"] for option in field["options"]]:
                raise ValueError(f"Unknown {field['key']}: {value}.")
        if field["kind"] != "number":
            continue
        maximum = field["max"]
        if isinstance(maximum, dict):
            maximum = params.get(maximum["parameter"])
        if type(value) not in (int, float) or maximum is None:
            raise ValueError(f"{field['key']} must be a finite number.")
        if not field["min"] <= value <= maximum:
            raise ValueError(f"{field['key']} must be from {field['min']} to {maximum}.")
        if field.get("integer") and value != int(value):
            raise ValueError(f"{field['key']} must be an integer.")
