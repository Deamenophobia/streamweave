import math

from .context import Context, Value


def align(context: Context) -> Value:
    inputs = [
        (i["edge"]["source"] + "_" + i["edge"]["sourcePort"], i["data"]) for i in context.inputs
    ]
    if any(not s["points"] for _, s in inputs):
        raise ValueError("Cannot align an empty series.")
    if len({key for key, _ in inputs}) != len(inputs):
        raise ValueError("Alignment keys must be unique.")
    p = context.params
    times = grid_times(inputs, p)
    columns = [
        {"key": k, "label": s["name"], "unit": s["unit"], "type": "number"} for k, s in inputs
    ]
    releases = [
        sorted(s["points"], key=lambda v: v.get("availableAtMs", v["timestampMs"]))
        for _, s in inputs
    ]
    maps = [{v["timestampMs"]: v for v in s["points"]} for _, s in inputs]
    cursors, latest = [0] * len(inputs), [None] * len(inputs)
    rows = []
    for index, t in enumerate(times):
        if index % 256 == 0:
            context.checkpoint()
        values, statuses = {}, {}
        for j, (key, _) in enumerate(inputs):
            if p["mode"] == "previous":
                while cursors[j] < len(releases[j]):
                    candidate = releases[j][cursors[j]]
                    if candidate.get("availableAtMs", candidate["timestampMs"]) > t:
                        break
                    if candidate["timestampMs"] <= t and (
                        latest[j] is None or candidate["timestampMs"] >= latest[j]["timestampMs"]
                    ):
                        latest[j] = candidate
                    cursors[j] += 1
                point = latest[j]
            else:
                point = maps[j].get(t)
            status = point_status(point, t, p)
            statuses[key] = status
            values[key] = point["value"] if status == "valid" else None
        rows.append({"timestampMs": t, "values": values, "statuses": statuses})
    return {"frame": {"kind": "frame", "columns": columns, "rows": rows}}


def grid_times(inputs: list, params: Value) -> list:
    if params["mode"] == "previous":
        step = int(params["stepMs"])
        start = math.ceil(min(s["points"][0]["timestampMs"] for _, s in inputs) / step) * step
        end = max(s["points"][-1]["timestampMs"] for _, s in inputs)
        count = max(0, math.floor((end - start) / step) + 1)
        if count > 20_000:
            raise ValueError("Alignment exceeds 20,000 rows. Increase the interval.")
        return [start + i * step for i in range(count)]
    counts = {}
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


def point_status(point, timestamp, params) -> str:
    if point is None or point.get("availableAtMs", point["timestampMs"]) > timestamp:
        return "missing"
    if params["mode"] == "previous" and timestamp - point["timestampMs"] > params["maxAgeMs"]:
        return "stale"
    return point["status"]
