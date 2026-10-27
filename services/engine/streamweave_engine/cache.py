"""Per-client bounded LRU of immutable node outputs. Nothing is persisted."""

import hashlib
import json
import sys
from collections import OrderedDict
from dataclasses import dataclass
from threading import Lock

from .contracts import Outputs


def encoded(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def digest(value: object) -> str:
    return hashlib.sha256(encoded(value)).hexdigest()


def retained_size(value: object, limit: int) -> int:
    """Conservative Python-object size, counting shared objects once per entry."""
    pending, seen, total = [value], set(), 0
    while pending:
        item = pending.pop()
        identity = id(item)
        if identity in seen:
            continue
        seen.add(identity)
        total += sys.getsizeof(item)
        if total > limit:
            return total
        if isinstance(item, dict):
            pending.extend(item.keys())
            pending.extend(item.values())
        elif isinstance(item, (list, tuple)):
            pending.extend(item)
    return total


@dataclass(frozen=True)
class CachedNode:
    outputs: Outputs
    encoded_bytes: int
    memory_bytes: int


class NodeCache:
    def __init__(self, max_bytes: int = 16_000_000, max_memory_bytes: int = 64_000_000):
        self.max_bytes = max_bytes
        self.max_memory_bytes = max_memory_bytes
        self.bytes = 0
        self.memory_bytes = 0
        self.entries: OrderedDict[str, CachedNode] = OrderedDict()
        self.lock = Lock()

    def get(self, key: str) -> CachedNode | None:
        with self.lock:
            entry = self.entries.get(key)
            if entry is None:
                return None
            self.entries.move_to_end(key)
            return entry

    def put(self, key: str, outputs: Outputs, size: int) -> None:
        if size > self.max_bytes:
            return
        memory = retained_size(outputs, self.max_memory_bytes)
        if memory > self.max_memory_bytes:
            return
        with self.lock:
            old = self.entries.pop(key, None)
            if old is not None:
                self.bytes -= old.encoded_bytes
                self.memory_bytes -= old.memory_bytes
            while self.entries and (
                self.bytes + size > self.max_bytes
                or self.memory_bytes + memory > self.max_memory_bytes
            ):
                _, removed = self.entries.popitem(last=False)
                self.bytes -= removed.encoded_bytes
                self.memory_bytes -= removed.memory_bytes
            self.entries[key] = CachedNode(outputs, size, memory)
            self.bytes += size
            self.memory_bytes += memory
