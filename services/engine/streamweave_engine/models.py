"""Validate the portable v2 document before numerical execution."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

from .catalogue import MODULES

Number = int | FiniteFloat
Cell = str | Number | None
Name = Annotated[str, Field(min_length=1, max_length=120)]
Identifier = Annotated[str, Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_-]{0,99}$")]


class DocumentModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid")


class Position(DocumentModel):
    x: Number
    y: Number


class Node(DocumentModel):
    id: Identifier
    type: str
    title: Annotated[str, Field(min_length=1, max_length=100)]
    position: Position
    params: dict[Identifier, Annotated[str, Field(max_length=200)] | Number]

    @model_validator(mode="after")
    def supported(self):
        if self.type not in MODULES or self.id in ("constructor", "prototype"):
            raise ValueError("Unknown module type or invalid identifier.")
        if not self.title.strip() or any(k in ("constructor", "prototype") for k in self.params):
            raise ValueError("Invalid module title or parameter identifier.")
        return self


class Edge(DocumentModel):
    id: Identifier
    source: Identifier
    target: Identifier
    sourcePort: str
    targetPort: str


class Graph(DocumentModel):
    version: Literal[2]
    name: Name
    nodes: Annotated[list[Node], Field(max_length=50)]
    edges: Annotated[list[Edge], Field(max_length=120)]


class Column(DocumentModel):
    key: Name
    label: Name
    type: Literal["number", "string"]
    unit: Annotated[str, Field(max_length=60)] = ""


class Dataset(DocumentModel):
    kind: Literal["table"]
    id: Name
    name: Name
    columns: Annotated[list[Column], Field(min_length=1, max_length=40)]
    rows: Annotated[list[dict[str, Cell]], Field(min_length=1, max_length=20_000)]

    @model_validator(mode="after")
    def table_contract(self):
        columns = {c.key: c for c in self.columns}
        if len(columns) != len(self.columns) or any(
            key in ("__proto__", "constructor", "prototype") for key in columns
        ):
            raise ValueError("Duplicate or reserved column.")
        if "timestampMs" not in columns or columns["timestampMs"].type != "number":
            raise ValueError("Dataset requires numeric timestampMs.")
        if "availableAtMs" in columns and columns["availableAtMs"].type != "number":
            raise ValueError("availableAtMs must be numeric.")
        previous = -1
        for row in self.rows:
            if row.keys() - columns.keys():
                raise ValueError("Row contains an undeclared column.")
            timestamp = timestamp_ms(row.get("timestampMs"))
            if timestamp <= previous:
                raise ValueError("Dataset timestamps must be unique and increasing.")
            previous = timestamp
            if row.get("availableAtMs") is not None:
                if timestamp_ms(row["availableAtMs"]) < timestamp:
                    raise ValueError("availableAtMs cannot precede timestampMs.")
            for key, value in row.items():
                validate_cell(columns[key], value)
        return self


def timestamp_ms(value: Cell) -> Number:
    if type(value) not in (int, float) or not 0 <= value <= 8.64e15 or value != int(value):
        raise ValueError("Timestamp needs integer epoch milliseconds in the supported date range.")
    return value


def validate_cell(column: Column, value: Cell) -> None:
    if value is None:
        return
    if column.type == "string":
        if not isinstance(value, str) or len(value) > 1000:
            raise ValueError(f"Invalid text cell in {column.key}.")
        return
    lower, upper = (-1e12, 1e12)
    if column.key.endswith("AtMs") or column.key == "timestampMs":
        lower, upper = (0, 2**53 - 1)
    if type(value) not in (int, float) or not lower <= value <= upper:
        raise ValueError(f"Invalid numeric cell in {column.key}.")


class Project(DocumentModel):
    format: Literal["streamweave-project"]
    version: Literal[2]
    graph: Graph
    datasets: Annotated[list[Dataset], Field(max_length=12)]

    @model_validator(mode="after")
    def bounds(self):
        if sum(len(d.rows) for d in self.datasets) > 50_000:
            raise ValueError("Project exceeds 50,000 rows.")
        if len({d.id for d in self.datasets}) != len(self.datasets):
            raise ValueError("Duplicate dataset ID.")
        if not self.graph.name.strip():
            raise ValueError("Graph needs a name.")
        return self
