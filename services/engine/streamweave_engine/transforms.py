import math
import operator

from .context import Context, Value, column_pair, series


def numeric_point(base: Value, value: float, status="valid") -> Value:
    return {
        **base,
        "value": value if math.isfinite(value) else None,
        "status": status if math.isfinite(value) else "undefined",
    }


def transform(context: Context) -> Value:
    src, p = context.value("series"), context.params
    lag, operation = int(p["lag"]), p["operation"]
    points = []
    for i, point in enumerate(src["points"]):
        previous = src["points"][i - lag] if i >= lag else None
        base = {
            "timestampMs": point["timestampMs"],
            "availableAtMs": max(
                point.get("availableAtMs", point["timestampMs"]),
                previous.get("availableAtMs", previous["timestampMs"]) if previous else 0,
            ),
        }
        if previous is None:
            points.append({**base, "value": None, "status": "warming"})
        elif previous["value"] is None or previous["status"] != "valid":
            points.append({**base, "value": None, "status": previous["status"]})
        elif operation == "lag":
            points.append({**base, "value": previous["value"], "status": "valid"})
        elif point["value"] is None or point["status"] != "valid":
            points.append({**base, "value": None, "status": point["status"]})
        else:
            points.append(numeric_point(base, change(point["value"], previous["value"], operation)))
    unit = {"percent": "%", "log": "log ratio"}.get(operation, src["unit"])
    return {"series": series(f"{src['name']} · {operation}({lag})", unit, points)}


def change(value: float, previous: float, operation: str) -> float:
    if operation == "difference":
        return value - previous
    if operation == "percent":
        return 100 * (value / previous - 1) if previous else math.nan
    return math.log(value / previous) if value > 0 and previous > 0 else math.nan


def scale(context: Context) -> Value:
    src, p = context.value("series"), context.params
    points = [
        dict(point)
        if point["value"] is None
        else numeric_point(point, point["value"] * p["factor"] + p["offset"], point["status"])
        for point in src["points"]
    ]
    return {"series": series(src["name"] + " · scaled", p.get("unit") or src["unit"], points)}


def smooth(context: Context) -> Value:
    src, previous, points = context.value("series"), None, []
    for point in src["points"]:
        if point["value"] is None or point["status"] != "valid":
            points.append(dict(point))
            previous = None
            continue
        value = point["value"]
        if previous is not None:
            alpha = 1 - 2 ** (
                -(point["timestampMs"] - previous["timestampMs"]) / context.params["halfLifeMs"]
            )
            value = previous["value"] + alpha * (value - previous["value"])
        output = {
            **point,
            "value": value,
            "availableAtMs": max(
                point.get("availableAtMs", point["timestampMs"]),
                previous.get("availableAtMs", 0) if previous else 0,
            ),
        }
        previous = output
        points.append(output)
    return {"series": {**src, "name": src["name"] + " · EMA", "points": points}}


def arithmetic(context: Context) -> Value:
    frame, p = context.value("frame"), context.params
    x, y, operation = p["x"], p["y"], p["operation"]
    a, b = column_pair(frame, x, y)
    if operation in ("add", "subtract") and a.get("unit") != b.get("unit"):
        raise ValueError("Addition and subtraction require matching units. Convert units upstream.")
    units = (a.get("unit", "undefined"), b.get("unit", "undefined"))
    unit = a.get("unit", "value")
    if operation == "multiply":
        unit = f"{units[0]} × {units[1]}"
    if operation == "divide":
        unit = "ratio" if units[0] == units[1] else f"{units[0]} / {units[1]}"
    calculate = {
        "add": operator.add,
        "subtract": operator.sub,
        "multiply": operator.mul,
        "divide": lambda left, right: left / right if right else math.nan,
    }[operation]
    points = []
    for row in frame["rows"]:
        left, right = row["values"][x], row["values"][y]
        base = {"timestampMs": row["timestampMs"]}
        if left is None or right is None:
            status = row["statuses"][x] if row["statuses"][x] != "valid" else row["statuses"][y]
            points.append({**base, "value": None, "status": status})
        else:
            points.append(numeric_point(base, calculate(left, right)))
    return {"series": series(f"{a['label']} {operation} {b['label']}", unit, points)}
