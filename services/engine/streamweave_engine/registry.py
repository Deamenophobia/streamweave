"""The only composition point for Python evaluators."""

from .alignment import align
from .catalogue import MODULES
from .pressure import pressure
from .statistics import correlation, regression, rolling
from .tables import field, filter_rows, output, source
from .transforms import arithmetic, scale, smooth, transform

EVALUATORS = {
    "source": source,
    "field": field,
    "filter": filter_rows,
    "align": align,
    "transform": transform,
    "scale": scale,
    "smooth": smooth,
    "rolling": rolling,
    "arithmetic": arithmetic,
    "correlation": correlation,
    "regression": regression,
    "pressure": pressure,
    "chart": output,
    "table": output,
    "export": output,
}

if EVALUATORS.keys() != MODULES.keys():
    raise RuntimeError("Python evaluators and shared module contracts disagree.")
