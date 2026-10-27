from .context import Context, Value, series


def select_series(table: Value, key: str, name: str, unit: str) -> Value:
    column = next((c for c in table["columns"] if c["key"] == key), None)
    if not column or column["type"] != "number" or key in ("timestampMs", "availableAtMs"):
        raise ValueError("Select a numeric value column.")
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
                "timestampMs": r["timestampMs"],
                "availableAtMs": r.get("availableAtMs") or r["timestampMs"],
                "value": r.get(key),
                "status": "missing" if r.get(key) is None else "valid",
            }
            for r in table["rows"]
        ]
    return series(name or column["label"], unit or column.get("unit") or "value", points)


def source(context: Context) -> Value:
    p = context.params
    dataset = context.datasets.get(p.get("datasetId"))
    if dataset is None:
        raise ValueError("Choose an available dataset.")
    outputs = {"data": {"kind": "table", "columns": dataset["columns"], "rows": dataset["rows"]}}
    if p.get("column"):
        outputs["series"] = select_series(
            dataset, p["column"], p.get("label") or dataset["name"], p.get("unit", "")
        )
    return outputs


def field(context: Context) -> Value:
    p = context.params
    return {
        "series": select_series(
            context.value("data"), p.get("column", ""), p.get("label", ""), p.get("unit", "")
        )
    }


def js_text(value) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def filter_rows(context: Context) -> Value:
    table, p = context.value("data"), context.params
    column = next((c for c in table["columns"] if c["key"] == p.get("column")), None)
    if column is None:
        raise ValueError("Choose a filter column.")
    operator, expected = p["operator"], str(p.get("value", ""))
    if operator in ("gte", "lte"):
        try:
            bound = float(expected)
            if column["type"] != "number" or not -float("inf") < bound < float("inf"):
                raise ValueError()
        except ValueError as error:
            raise ValueError("Numeric comparison needs a numeric column and value.") from error
    predicates = {
        "present": lambda v: True,
        "eq": lambda v: js_text(v) == expected,
        "gte": lambda v: v >= bound,
        "lte": lambda v: v <= bound,
    }
    matches = predicates[operator]
    rows = [
        r for r in table["rows"] if r.get(column["key"]) is not None and matches(r[column["key"]])
    ]
    return {"data": {**table, "rows": rows}}


def output(_context: Context) -> Value:
    return {}
