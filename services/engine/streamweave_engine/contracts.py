"""Internal value types. External JSON is validated once in models.py."""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal, NotRequired, TypedDict

type Cell = str | float | None
type Params = dict[str, str | float]
type Quality = Literal["valid", "missing", "stale", "warming", "undefined"]


class Column(TypedDict):
    key: str
    label: str
    type: Literal["number", "string"]
    unit: NotRequired[str]


class Point(TypedDict):
    timestampMs: float
    value: float | None
    status: Quality
    availableAtMs: NotRequired[float]
    sampleCount: NotRequired[int]


class Series(TypedDict):
    kind: Literal["series"]
    name: str
    unit: str
    points: list[Point]


class Table(TypedDict):
    kind: Literal["table"]
    columns: list[Column]
    rows: list[dict[str, Cell]]


class Dataset(Table):
    id: str
    name: str


class FrameRow(TypedDict):
    timestampMs: float
    values: dict[str, float | None]
    statuses: dict[str, Quality]


class Frame(TypedDict):
    kind: Literal["frame"]
    columns: list[Column]
    rows: list[FrameRow]


type DataValue = Series | Table | Frame
type Outputs = dict[str, DataValue]


class Position(TypedDict):
    x: float
    y: float


class Node(TypedDict):
    id: str
    type: str
    title: str
    position: Position
    params: Params


class Edge(TypedDict):
    id: str
    source: str
    target: str
    sourcePort: str
    targetPort: str


class Graph(TypedDict):
    version: Literal[2]
    name: str
    nodes: list[Node]
    edges: list[Edge]


class Input(TypedDict):
    edge: Edge
    data: DataValue


class NodeResult(TypedDict):
    state: Literal["ready", "error", "blocked"]
    outputs: Outputs
    key: NotRequired[str]
    error: NotRequired[str]


class EngineMetadata(TypedDict):
    id: Literal["python"]
    version: str
    protocolVersion: Literal[2]
    contractHash: str
    libraries: dict[str, str]


class Metrics(TypedDict):
    durationMs: float
    cacheHits: int
    nodeCount: int


class RunResult(TypedDict):
    nodes: dict[str, NodeResult]
    order: list[str]
    engine: EngineMetadata
    metrics: Metrics


@dataclass(frozen=True)
class DatasetBundle:
    """Validated, immutable-by-ownership datasets shared by jobs in one session."""

    id: str
    datasets: dict[str, Dataset]
    keys: dict[str, str]
    encoded_bytes: int


@dataclass(frozen=True)
class Study:
    graph: Graph
    bundle: DatasetBundle


type Checkpoint = Callable[[], None]
type Progress = Callable[[int, int], None]
