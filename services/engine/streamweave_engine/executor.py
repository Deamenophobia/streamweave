"""Pure document execution with optional cache, progress, and cooperative cancellation."""

import time

import numpy as np
import scipy

from . import VERSION
from .cache import NodeCache, digest, encoded
from .catalogue import CONTRACT_HASH
from .context import Context
from .graph import evaluate, plan
from .models import Project


class Cancelled(Exception):
    pass


def execute(project, cache=None, checkpoint=lambda: None, progress=lambda done, total: None):
    started = time.perf_counter()
    checkpoint()
    document = Project.model_validate(project).model_dump(exclude_unset=True)
    nodes, incoming, order = plan(document["graph"])
    datasets = {d["id"]: d for d in document["datasets"]}
    dataset_keys = {key: digest(value) for key, value in datasets.items()}
    cache = cache if cache is not None else NodeCache()
    results, keys = {}, {}
    hits, output_bytes = 0, 0
    for index, key in enumerate(order):
        checkpoint()
        node, edges = nodes[key], incoming[key]
        blocked = next(
            (
                e
                for e in edges
                if results[e["source"]]["state"] != "ready"
                or e["sourcePort"] not in results[e["source"]]["outputs"]
            ),
            None,
        )
        if blocked:
            results[key] = {
                "state": "blocked",
                "outputs": {},
                "error": f"Waiting for {nodes[blocked['source']]['title']} / {blocked['sourcePort']}.",
            }
            keys[key] = digest(results[key])
            progress(index + 1, len(order))
            continue
        inputs = [
            {"edge": edge, "data": results[edge["source"]]["outputs"][edge["sourcePort"]]}
            for edge in edges
        ]
        cache_key = digest(
            {
                "contract": CONTRACT_HASH,
                "node": {k: v for k, v in node.items() if k != "position"},
                "dataset": dataset_keys.get(node["params"].get("datasetId")),
                "inputs": [{"edge": edge, "upstream": keys[edge["source"]]} for edge in edges],
            }
        )
        keys[key] = cache_key
        cached = cache.get(cache_key)
        try:
            if cached is None:
                outputs = evaluate(Context(node, inputs, datasets, checkpoint))
                size = len(encoded(outputs))
                checkpoint()
                cache.put(cache_key, outputs, size)
            else:
                outputs, size = cached
                hits += 1
            output_bytes += size
            if output_bytes > 30_000_000:
                raise ValueError(
                    "Combined results exceed 30 MB. Reduce the study or output branches."
                )
            results[key] = {"state": "ready", "outputs": outputs}
        except (ValueError, ArithmeticError) as error:
            results[key] = {"state": "error", "outputs": {}, "error": str(error)}
        progress(index + 1, len(order))
    checkpoint()
    return {
        "nodes": results,
        "order": order,
        "engine": {
            "id": "python",
            "version": VERSION,
            "protocolVersion": 1,
            "contractHash": CONTRACT_HASH,
            "libraries": {"numpy": np.__version__, "scipy": scipy.__version__},
        },
        "metrics": {
            "durationMs": (time.perf_counter() - started) * 1000,
            "cacheHits": hits,
            "nodeCount": len(order),
        },
    }
