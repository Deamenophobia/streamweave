import math
from typing import cast

from .context import Context
from .contracts import Column, FrameRow, Outputs, Params, Point, Quality, Series


def align(context: Context) -> Outputs:
    inputs = [
        (i["edge"]["source"] + "_" + i["edge"]["sourcePort"], cast(Series, i["data"]))
        for i in context.inputs
    ]
    if any(not s["points"] for _, s in inputs):
        raise ValueError("Cannot align an empty series.")
    if len({key for key, _ in inputs}) != len(inputs):
        raise ValueError("Alignment keys must be unique.")
    p = context.params
    times = grid_times(inputs, p)
    columns: list[Column] = [
        {"key": k, "label": s["name"], "unit": s["unit"], "type": "number"} for k, s in inputs
    ]
    releases = [
        sorted(s["points"], key=lambda v: v.get("availableAtMs", v["timestampMs"]))
        for _, s in inputs
    ]
    maps = [{v["timestampMs"]: v for v in s["points"]} for _, s in inputs]
    cursors = [0] * len(inputs)
    latest: list[Point | None] = [None] * len(inputs)
    rows: list[FrameRow] = []
    for index, t in enumerate(times):
        if index % 256 == 0:
            context.checkpoint()
        values: dict[str, float | None] = {}
        statuses: dict[str, Quality] = {}
        for j, (key, _) in enumerate(inputs):
            if p["mode"] == "previous":
                while cursors[j] < len(releases[j]):
                    candidate = releases[j][cursors[j]]
                    if candidate.get("availableAtMs", candidate["timestampMs"]) > t:
                        break
                    if candidate["timestampMs"] <= t and (
                        latest[j] is None
                        or candidate["timestampMs"] >= cast(Point, latest[j])["timestampMs"]
                    ):
                        latest[j] = candidate
                    cursors[j] += 1
                point = latest[j]
            else:
                point = maps[j].get(t)
            status = point_status(point, t, p)
            statuses[key] = status
            values[key] = point["value"] if status == "valid" and point is not None else None
        rows.append({"timestampMs": t, "values": values, "statuses": statuses})
    return {"frame": {"kind": "frame", "columns": columns, "rows": rows}}


def grid_times(inputs: list[tuple[str, Series]], params: Params) -> list[float]:
    if params["mode"] == "previous":
        step = int(params["stepMs"])
        start = math.ceil(min(s["points"][0]["timestampMs"] for _, s in inputs) / step) * step
        end = max(s["points"][-1]["timestampMs"] for _, s in inputs)
        count = max(0, math.floor((end - start) / step) + 1)
        if count > 20_000:
            raise ValueError("Alignment exceeds 20,000 rows. Increase the interval.")
        return [start + i * step for i in range(count)]
    counts: dict[float, int] = {}
    for _, s in inputs:
        for point in s["points"]:
            t = point["timestampMs"]
            counts[t] = counts.get(t, 0) + 1
    times = sorted(
        t for t, count in counts.items() if params["mode"] == "union" or count == len(inputs)
    )
    if len(times) > 20_000:
        raise ValueError("Alignment exceeds 20,000 rows.")
    return times


def point_status(point: Point | None, timestamp: float, params: Params) -> Quality:
    if point is None or point.get("availableAtMs", point["timestampMs"]) > timestamp:
        return "missing"
    if params["mode"] == "previous" and timestamp - point["timestampMs"] > cast(
        float, params["maxAgeMs"]
    ):
        return "stale"
    return point["status"]
