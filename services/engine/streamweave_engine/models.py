"""Validate the portable v2 document before numerical execution."""

from hashlib import sha256
from typing import Annotated, Literal, Self, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, TypeAdapter, model_validator

from . import contracts
from .cache import encoded
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
    def supported(self) -> Self:
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

    @model_validator(mode="after")
    def named(self) -> Self:
        if not self.name.strip():
            raise ValueError("Graph needs a name.")
        return self


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
    def table_contract(self) -> Self:
        columns = {c.key: c for c in self.columns}
        if len(columns) != len(self.columns) or any(
            key in ("__proto__", "constructor", "prototype") for key in columns
        ):
            raise ValueError("Duplicate or reserved column.")
        if "timestampMs" not in columns or columns["timestampMs"].type != "number":
            raise ValueError("Dataset requires numeric timestampMs.")
        if "availableAtMs" in columns and columns["availableAtMs"].type != "number":
            raise ValueError("availableAtMs must be numeric.")
        previous: float = -1
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
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not 0 <= value <= 8.64e15
        or value != int(value)
    ):
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
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not lower <= value <= upper
    ):
        raise ValueError(f"Invalid numeric cell in {column.key}.")


class Project(DocumentModel):
    format: Literal["streamweave-project"]
    version: Literal[2]
    graph: Graph
    datasets: Annotated[list[Dataset], Field(max_length=12)]


DatasetList: TypeAdapter[list[Dataset]] = TypeAdapter(
    Annotated[list[Dataset], Field(max_length=12)]
)


def bundle_from_models(key: str, datasets: list[Dataset]) -> contracts.DatasetBundle:
    if sum(len(d.rows) for d in datasets) > 50_000 or len({d.id for d in datasets}) != len(
        datasets
    ):
        raise ValueError("Datasets exceed row bounds or contain duplicate IDs.")
    values = {d.id: cast(contracts.Dataset, d.model_dump(exclude_unset=True)) for d in datasets}
    payloads = {key: encoded(value) for key, value in values.items()}
    return contracts.DatasetBundle(
        key,
        values,
        {key: sha256(value).hexdigest() for key, value in payloads.items()},
        sum(map(len, payloads.values())),
    )


def read_datasets(key: str, raw: object) -> contracts.DatasetBundle:
    return bundle_from_models(key, DatasetList.validate_python(raw))


def read_project(raw: object) -> contracts.Study:
    project = Project.model_validate(raw)
    return contracts.Study(
        cast(contracts.Graph, project.graph.model_dump(exclude_unset=True)),
        bundle_from_models("local", project.datasets),
    )


class JobRequest(DocumentModel):
    protocolVersion: Literal[2]
    contractHash: Annotated[str, Field(min_length=64, max_length=64)]
    jobId: str
    bundleId: str
    graph: Graph
    knownResults: Annotated[
        dict[Identifier, Annotated[str, Field(max_length=64)]], Field(max_length=50)
    ] = {}

    @model_validator(mode="after")
    def identifiers(self) -> Self:
        UUID(self.jobId)
        UUID(self.bundleId)
        return self
