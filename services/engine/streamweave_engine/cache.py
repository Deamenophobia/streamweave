"""Per-client bounded LRU of immutable node outputs. Nothing is persisted."""

import hashlib
import json
from collections import OrderedDict
from threading import Lock


def encoded(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def digest(value) -> str:
    return hashlib.sha256(encoded(value)).hexdigest()


class NodeCache:
    def __init__(self, max_bytes=16_000_000):
        self.max_bytes = max_bytes
        self.bytes = 0
        self.entries = OrderedDict()
        self.lock = Lock()

    def get(self, key):
        with self.lock:
            entry = self.entries.get(key)
            if entry is None:
                return None
            self.entries.move_to_end(key)
            return entry

    def put(self, key, outputs, size):
        if size > self.max_bytes:
            return
        with self.lock:
            old = self.entries.pop(key, None)
            if old is not None:
                self.bytes -= old[1]
            while self.entries and self.bytes + size > self.max_bytes:
                _, (_, removed_size) = self.entries.popitem(last=False)
                self.bytes -= removed_size
            self.entries[key] = (outputs, size)
            self.bytes += size
