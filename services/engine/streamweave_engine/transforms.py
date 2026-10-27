import math
import operator
from collections.abc import Callable

from .context import Context, column_pair, series
from .contracts import Outputs, Point


def numeric_point(base: Point, value: float) -> Point:
    if not math.isfinite(value):
        return {**base, "value": None, "status": "undefined"}
    return {**base, "value": value}


def change(value: float, previous: float, operation: str) -> float:
    if operation == "difference":
        return value - previous
    if operation == "percent":
        return 100 * (value / previous - 1) if previous else math.nan
    return math.log(value / previous) if value > 0 and previous > 0 else math.nan


def changed_point(point: Point, previous: Point | None, operation: str) -> Point:
    base: Point = {
        "timestampMs": point["timestampMs"],
        "value": None,
        "status": "warming",
        "availableAtMs": max(
            point.get("availableAtMs", point["timestampMs"]),
            previous.get("availableAtMs", previous["timestampMs"]) if previous else 0,
        ),
    }
    if previous is None:
        return base
    if previous["value"] is None or previous["status"] != "valid":
        return {**base, "status": previous["status"]}
    if operation == "lag":
        return {**base, "value": previous["value"], "status": "valid"}
    if point["value"] is None or point["status"] != "valid":
        return {**base, "status": point["status"]}
    return numeric_point(
        {**base, "status": "valid"}, change(point["value"], previous["value"], operation)
    )


def transform(context: Context) -> Outputs:
    source, lag, operation = context.series(), int(context.number("lag")), context.text("operation")
    points: list[Point] = []
    for i, point in enumerate(source["points"]):
        if i % 256 == 0:
            context.checkpoint()
        points.append(
            changed_point(point, source["points"][i - lag] if i >= lag else None, operation)
        )
    unit = {"percent": "%", "log": "log ratio"}.get(operation, source["unit"])
    return {"series": series(f"{source['name']} · {operation}({lag})", unit, points)}


def scale(context: Context) -> Outputs:
    source = context.series()
    factor, offset = context.number("factor"), context.number("offset")
    points = [
        point.copy()
        if point["value"] is None
        else numeric_point(point, point["value"] * factor + offset)
        for point in source["points"]
    ]
    return {
        "series": series(
            source["name"] + " · scaled", context.text("unit") or source["unit"], points
        )
    }


def smooth(context: Context) -> Outputs:
    source = context.series()
    previous: Point | None = None
    points: list[Point] = []
    for index, point in enumerate(source["points"]):
        if index % 256 == 0:
            context.checkpoint()
        if point["value"] is None or point["status"] != "valid":
            points.append(point.copy())
            previous = None
            continue
        value = point["value"]
        if previous is not None and previous["value"] is not None:
            alpha = 1 - 2 ** (
                -(point["timestampMs"] - previous["timestampMs"]) / context.number("halfLifeMs")
            )
            value = previous["value"] + alpha * (value - previous["value"])
        output: Point = {
            **point,
            "value": value,
            "availableAtMs": max(
                point.get("availableAtMs", point["timestampMs"]),
                previous.get("availableAtMs", 0) if previous else 0,
            ),
        }
        previous = output
        points.append(output)
    return {"series": {**source, "name": source["name"] + " · EMA", "points": points}}


def arithmetic(context: Context) -> Outputs:
    frame, x, y, operation = (
        context.frame(),
        context.text("x"),
        context.text("y"),
        context.text("operation"),
    )
    a, b = column_pair(frame, x, y)
    if operation in ("add", "subtract") and a.get("unit") != b.get("unit"):
        raise ValueError("Addition and subtraction require matching units. Convert units upstream.")
    units = (a.get("unit", "undefined"), b.get("unit", "undefined"))
    unit = a.get("unit", "value")
    if operation == "multiply":
        unit = f"{units[0]} × {units[1]}"
    if operation == "divide":
        unit = "ratio" if units[0] == units[1] else f"{units[0]} / {units[1]}"
    operations: dict[str, Callable[[float, float], float]] = {
        "add": operator.add,
        "subtract": operator.sub,
        "multiply": operator.mul,
        "divide": lambda left, right: left / right if right else math.nan,
    }
    points: list[Point] = []
    for index, row in enumerate(frame["rows"]):
        if index % 256 == 0:
            context.checkpoint()
        left, right = row["values"][x], row["values"][y]
        base: Point = {"timestampMs": row["timestampMs"], "value": None, "status": "valid"}
        if left is None or right is None:
            base["status"] = (
                row["statuses"][x] if row["statuses"][x] != "valid" else row["statuses"][y]
            )
            points.append(base)
        else:
            points.append(numeric_point(base, operations[operation](left, right)))
    return {"series": series(f"{a['label']} {operation} {b['label']}", unit, points)}
