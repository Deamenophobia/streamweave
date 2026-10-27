from typing import cast

from .context import Context, series
from .contracts import Cell, Frame, Outputs, Point, Series, Table


def select_series(table: Table | Frame, key: str, name: str, unit: str) -> Series:
    column = next((c for c in table["columns"] if c["key"] == key), None)
    if not column or column["type"] != "number" or key in ("timestampMs", "availableAtMs"):
        raise ValueError("Select a numeric value column.")
    points: list[Point]
    if table["kind"] == "frame":
        points = [
            {
                "timestampMs": r["timestampMs"],
                "value": r["values"][key],
                "status": r["statuses"][key],
            }
            for r in table["rows"]
        ]
    else:
        if not any(c["key"] == "timestampMs" and c["type"] == "number" for c in table["columns"]):
            raise ValueError(
                "A series requires a timestamped table; model coefficients are not a time series."
            )
        points = [
            {
                "timestampMs": cast(float, r["timestampMs"]),
                "availableAtMs": cast(float, r.get("availableAtMs") or r["timestampMs"]),
                "value": cast(float | None, r.get(key)),
                "status": "missing" if r.get(key) is None else "valid",
            }
            for r in table["rows"]
        ]
    return series(name or column["label"], unit or column.get("unit") or "value", points)


def source(context: Context) -> Outputs:
    dataset = context.datasets.get(context.text("datasetId"))
    if dataset is None:
        raise ValueError("Choose an available dataset.")
    outputs: Outputs = {
        "data": {"kind": "table", "columns": dataset["columns"], "rows": dataset["rows"]}
    }
    if context.text("column"):
        outputs["series"] = select_series(
            dataset,
            context.text("column"),
            context.text("label") or dataset["name"],
            context.text("unit"),
        )
    return outputs


def field(context: Context) -> Outputs:
    return {
        "series": select_series(
            cast(Table | Frame, context.value("data")),
            context.text("column"),
            context.text("label"),
            context.text("unit"),
        )
    }


def js_text(value: Cell) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def filter_rows(context: Context) -> Outputs:
    table = context.table()
    column = next((c for c in table["columns"] if c["key"] == context.text("column")), None)
    if column is None:
        raise ValueError("Choose a filter column.")
    operator, expected = context.text("operator"), context.text("value")
    bound = 0.0
    if operator in ("gte", "lte"):
        try:
            bound = float(expected)
            if column["type"] != "number" or not -float("inf") < bound < float("inf"):
                raise ValueError()
        except ValueError as error:
            raise ValueError("Numeric comparison needs a numeric column and value.") from error

    def matches(value: Cell) -> bool:
        if value is None:
            return False
        if operator == "present":
            return True
        if operator == "eq":
            return js_text(value) == expected
        number = cast(float, value)
        return number >= bound if operator == "gte" else number <= bound

    rows = [r for r in table["rows"] if matches(r.get(column["key"]))]
    return {"data": {**table, "rows": rows}}


def output(_context: Context) -> Outputs:
    return {}
