"""Graph structure checks independent of numerical evaluators."""

from .catalogue import MODULES, validate_parameters
from .context import Context
from .registry import EVALUATORS


def plan(graph):
    nodes = {n["id"]: n for n in graph["nodes"]}
    if len(nodes) != len(graph["nodes"]):
        raise ValueError("Module IDs must be unique.")
    incoming = {key: [] for key in nodes}
    ids, wires, occupied = set(), set(), set()
    for edge in graph["edges"]:
        if edge["id"] in ids or edge["id"] in ("constructor", "prototype"):
            raise ValueError("Connection IDs must be unique and valid.")
        ids.add(edge["id"])
        source, target = nodes.get(edge["source"]), nodes.get(edge["target"])
        if not source or not target or source is target:
            raise ValueError("Unknown module or self connection.")
        output = next(
            (p for p in MODULES[source["type"]]["outputs"] if p["id"] == edge["sourcePort"]), None
        )
        port = next(
            (p for p in MODULES[target["type"]]["inputs"] if p["id"] == edge["targetPort"]), None
        )
        if not port or not output or not set(output["accepts"]) & set(port["accepts"]):
            raise ValueError("Unknown or incompatible port.")
        wire = (edge["source"], edge["sourcePort"], edge["target"], edge["targetPort"])
        if wire in wires:
            raise ValueError("This connection already exists.")
        wires.add(wire)
        destination = (edge["target"], edge["targetPort"])
        if not port.get("multiple") and destination in occupied:
            raise ValueError("This port accepts one connection.")
        occupied.add(destination)
        incoming[edge["target"]].append(edge)
    pending, order = set(nodes), []
    while pending:
        ready = [
            key
            for key in nodes
            if key in pending and all(e["source"] not in pending for e in incoming[key])
        ]
        if not ready:
            raise ValueError("Connections must not form a cycle.")
        order.extend(ready)
        pending.difference_update(ready)
    return nodes, incoming, order


def evaluate(context: Context):
    definition = MODULES[context.node["type"]]
    for port in definition["inputs"]:
        values = [i["data"] for i in context.inputs if i["edge"]["targetPort"] == port["id"]]
        minimum = port.get("minimum", 1)
        if len(values) < minimum:
            raise ValueError(
                f"Connect {minimum}{' or more' if port.get('multiple') else ''} {' / '.join(port['accepts'])} input{'s' if minimum > 1 else ''} to {port['label']}."
            )
        if any(v["kind"] not in port["accepts"] for v in values):
            raise ValueError(f"Incompatible data on {port['label']}.")
    validate_parameters(context.node["type"], context.params)
    outputs = EVALUATORS[context.node["type"]](context)
    ports = {p["id"]: p for p in definition["outputs"]}
    if any(
        key not in ports or value["kind"] not in ports[key]["accepts"]
        for key, value in outputs.items()
    ):
        raise ValueError("Invalid output contract.")
    return outputs
