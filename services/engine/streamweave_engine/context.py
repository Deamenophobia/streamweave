from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

Value = dict[str, Any]


@dataclass(frozen=True)
class Context:
    node: Value
    inputs: list[Value]
    datasets: dict[str, Value]
    checkpoint: Callable[[], None]

    @property
    def params(self) -> Value:
        return self.node["params"]

    def value(self, port: str) -> Value:
        return next(item["data"] for item in self.inputs if item["edge"]["targetPort"] == port)


def series(name: str, unit: str, points: list[Value]) -> Value:
    return {"kind": "series", "name": name, "unit": unit, "points": points}


def column_pair(frame: Value, x: str, y: str) -> tuple[Value, Value]:
    columns = {c["key"]: c for c in frame["columns"]}
    if x == y or x not in columns or y not in columns:
        raise ValueError("Select two different aligned columns.")
    return columns[x], columns[y]
