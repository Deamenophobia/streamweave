"""Linear-time rolling moments and extrema with bounded window state."""

import math
from collections import deque
from dataclasses import dataclass

from .contracts import Checkpoint, Frame, Point, Quality, Series


@dataclass
class Moments:
    count: int = 0
    x: float = 0.0
    y: float = 0.0
    xx: float = 0.0
    yy: float = 0.0
    xy: float = 0.0

    def update(self, x: float, y: float, direction: int) -> None:
        count = self.count + direction
        if count == 0:
            self.count = 0
            self.x = self.y = self.xx = self.yy = self.xy = 0.0
            return
        dx, dy = x - self.x, y - self.y
        self.x += direction * dx / count
        self.y += direction * dy / count
        self.xx += direction * dx * (x - self.x)
        self.yy += direction * dy * (y - self.y)
        self.xy += direction * dx * (y - self.y)
        self.count = count


class MomentWindow:
    def __init__(self, width: int) -> None:
        self.width = width
        self.values: deque[tuple[float, float] | None] = deque()
        self.origin: tuple[float, float] | None = None
        self.moments = Moments()
        self.steps = 0
        self.x_min, self.x_max = ExtremumWindow(width, False), ExtremumWindow(width)
        self.y_min, self.y_max = ExtremumWindow(width, False), ExtremumWindow(width)

    def push(self, value: tuple[float, float] | None) -> Moments:
        if value is not None and self.origin is None:
            self.origin = value
        if len(self.values) == self.width:
            expired = self.values.popleft()
            if expired is not None and self.origin is not None:
                self.moments.update(expired[0] - self.origin[0], expired[1] - self.origin[1], -1)
        self.values.append(value)
        if value is not None and self.origin is not None:
            self.moments.update(value[0] - self.origin[0], value[1] - self.origin[1], 1)
        self.steps += 1
        low_x = self.x_min.push(self.steps, value[0] if value else None)
        high_x = self.x_max.push(self.steps, value[0] if value else None)
        low_y = self.y_min.push(self.steps, value[1] if value else None)
        high_y = self.y_max.push(self.steps, value[1] if value else None)
        # Periodic rebuilds bound drift. Rebase earlier when the old origin dwarfs
        # the remaining window, before subtraction erases its smaller variation.
        rebase = self.origin is not None and (
            origin_outgrew(self.origin[0], low_x, high_x)
            or origin_outgrew(self.origin[1], low_y, high_y)
        )
        if self.steps % self.width == 0 or rebase:
            self._rebuild()
        # Constant windows are exactly undefined for correlation. Removal roundoff
        # must not turn a zero variance into a tiny positive variance.
        if self.origin is not None:
            if low_x is not None and low_x == high_x:
                self.moments.x = low_x - self.origin[0]
                self.moments.xx = self.moments.xy = 0.0
            if low_y is not None and low_y == high_y:
                self.moments.y = low_y - self.origin[1]
                self.moments.yy = self.moments.xy = 0.0
        return self.moments

    def _rebuild(self) -> None:
        values = [v for v in self.values if v is not None]
        count = len(values)
        if not count:
            self.moments = Moments()
            self.origin = None
            return
        self.origin = values[0]
        values = [(x - self.origin[0], y - self.origin[1]) for x, y in values]
        x = math.fsum(v[0] for v in values) / count
        y = math.fsum(v[1] for v in values) / count
        self.moments = Moments(
            count,
            x,
            y,
            math.fsum((v[0] - x) * (v[0] - x) for v in values),
            math.fsum((v[1] - y) * (v[1] - y) for v in values),
            math.fsum((v[0] - x) * (v[1] - y) for v in values),
        )


def origin_outgrew(origin: float, low: float | None, high: float | None) -> bool:
    return low is not None and high is not None and abs(origin) > 2 * max(abs(low), abs(high))


class ExtremumWindow:
    def __init__(self, width: int, maximum: bool = True) -> None:
        self.width, self.maximum = width, maximum
        self.values: deque[tuple[int, float]] = deque()

    def push(self, index: int, value: float | None) -> float | None:
        while self.values and self.values[0][0] <= index - self.width:
            self.values.popleft()
        if value is not None:
            while self.values and (
                value >= self.values[-1][1] if self.maximum else value <= self.values[-1][1]
            ):
                self.values.pop()
            self.values.append((index, value))
        return self.values[0][1] if self.values else None


def rolling_points(
    source: Series,
    width: int,
    minimum: int,
    operation: str,
    checkpoint: Checkpoint,
) -> list[Point]:
    moments = MomentWindow(width) if operation in ("mean", "std") else None
    extrema = ExtremumWindow(width, operation == "max")
    availability = ExtremumWindow(width)
    flags: deque[bool] = deque()
    count = 0
    points: list[Point] = []
    for index, point in enumerate(source["points"]):
        if index % 256 == 0:
            checkpoint()
        value = point["value"] if point["status"] == "valid" else None
        if len(flags) == width:
            count -= flags.popleft()
        flags.append(value is not None)
        count += value is not None
        result: float | None = None
        if moments is not None:
            m = moments.push((value, 0.0) if value is not None else None)
            if count:
                if operation == "mean" and moments.origin is not None:
                    result = moments.origin[0] + m.x
                elif count > 1 and math.isfinite(m.xx):
                    result = math.sqrt(max(0.0, m.xx) / (count - 1))
        elif operation == "count":
            result = float(count)
        else:
            result = extrema.push(index, value)
        available = availability.push(index, point.get("availableAtMs", point["timestampMs"]))
        status: Quality = "valid" if result is not None and math.isfinite(result) else "undefined"
        if count < minimum:
            status = "warming"
        output: Point = {
            "timestampMs": point["timestampMs"],
            "sampleCount": count,
            "value": result if status == "valid" else None,
            "status": status,
        }
        if available is not None:
            output["availableAtMs"] = available
        points.append(output)
    return points


def correlation_points(
    frame: Frame,
    x: str,
    y: str,
    width: int,
    minimum: int,
    checkpoint: Checkpoint,
) -> list[Point]:
    window = MomentWindow(width)
    points: list[Point] = []
    for index, row in enumerate(frame["rows"]):
        if index % 256 == 0:
            checkpoint()
        left, right = row["values"][x], row["values"][y]
        valid = (
            left is not None
            and right is not None
            and row["statuses"][x] == row["statuses"][y] == "valid"
        )
        pair = (left, right) if valid and left is not None and right is not None else None
        m = window.push(pair)
        status: Quality = "warming"
        value = None
        if m.count >= minimum:
            if not all(math.isfinite(v) for v in (m.x, m.y, m.xx, m.yy, m.xy)):
                raise ValueError("Statistical moments overflowed. Rescale the input values.")
            status = "undefined"
            if m.xx > 0 and m.yy > 0:
                value = max(-1.0, min(1.0, m.xy / math.sqrt(m.xx) / math.sqrt(m.yy)))
                status = "valid"
        points.append(
            {
                "timestampMs": row["timestampMs"],
                "sampleCount": m.count,
                "value": value,
                "status": status,
            }
        )
    return points
