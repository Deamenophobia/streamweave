"""Two bounded local sessions. The job manager owns synchronization and active pins."""

import time
from collections import OrderedDict
from dataclasses import dataclass, field

from .cache import NodeCache
from .contracts import DatasetBundle
from .errors import EngineError


@dataclass
class Session:
    bundle: DatasetBundle | None = None
    cache: NodeCache = field(default_factory=NodeCache)
    touched: float = field(default_factory=time.monotonic)


class Sessions:
    def __init__(self) -> None:
        self.entries: OrderedDict[str, Session] = OrderedDict()

    def get(self, key: str, active: set[str], create: bool = False) -> Session:
        if key not in self.entries:
            if not create:
                raise EngineError(
                    "datasets_missing", "Upload datasets before running this study.", 409
                )
            if len(self.entries) >= 2:
                victim = next((s for s in self.entries if s not in active), None)
                if victim is None:
                    raise EngineError(
                        "capacity", "Two sessions are active. Retry after completion.", 429
                    )
                del self.entries[victim]
            self.entries[key] = Session()
        session = self.entries[key]
        session.touched = time.monotonic()
        self.entries.move_to_end(key)
        return session

    def expire(self, now: float, active: set[str]) -> None:
        expired = [
            key for key, s in self.entries.items() if key not in active and now - s.touched > 300
        ]
        for key in expired:
            del self.entries[key]

    def clear(self) -> None:
        self.entries.clear()
