from dataclasses import dataclass
from typing import cast

from .contracts import (
    Checkpoint,
    Column,
    Dataset,
    DataValue,
    Frame,
    Input,
    Node,
    Params,
    Point,
    Series,
    Table,
)


@dataclass(frozen=True)
class Context:
    node: Node
    inputs: list[Input]
    datasets: dict[str, Dataset]
    checkpoint: Checkpoint

    @property
    def params(self) -> Params:
        return self.node["params"]

    def text(self, key: str, default: str = "") -> str:
        return cast(str, self.params.get(key, default))

    def number(self, key: str) -> float:
        return cast(float, self.params[key])

    def value(self, port: str) -> DataValue:
        return next(item["data"] for item in self.inputs if item["edge"]["targetPort"] == port)

    # Graph ports are checked once before evaluation. These casts do not re-scan data.
    def series(self, port: str = "series") -> Series:
        return cast(Series, self.value(port))

    def frame(self, port: str = "frame") -> Frame:
        return cast(Frame, self.value(port))

    def table(self, port: str = "data") -> Table:
        return cast(Table, self.value(port))


def series(name: str, unit: str, points: list[Point]) -> Series:
    return {"kind": "series", "name": name, "unit": unit, "points": points}


def column_pair(frame: Frame, x: str, y: str) -> tuple[Column, Column]:
    columns = {c["key"]: c for c in frame["columns"]}
    if x == y or x not in columns or y not in columns:
        raise ValueError("Select two different aligned columns.")
    return columns[x], columns[y]
