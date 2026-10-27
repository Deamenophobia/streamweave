"""Compact wire projection. Internal results retain typed, shared objects."""

from .contracts import RunResult, Study


def result_payload(result: RunResult, study: Study, known: dict[str, str]) -> dict[str, object]:
    nodes: dict[str, object] = {}
    graph = {node["id"]: node for node in study.graph["nodes"]}
    for key, value in result["nodes"].items():
        node: dict[str, object] = dict(value)
        if value["state"] == "ready" and known.get(key) == value.get("key"):
            node.pop("outputs")
            node["reused"] = True
        elif graph[key]["type"] == "source" and "data" in value["outputs"]:
            # The browser already owns this exact uploaded dataset.
            node["outputs"] = {
                port: data for port, data in value["outputs"].items() if port != "data"
            }
            node["sourceDataset"] = graph[key]["params"]["datasetId"]
        nodes[key] = node
    return {**result, "nodes": nodes}
