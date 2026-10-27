"""JSON-lines harness for reproducible cross-engine benchmarks; not an HTTP service."""

import json
import sys

from .cache import NodeCache, encoded
from .executor import execute

cache = NodeCache()
for line in sys.stdin:
    request = json.loads(line)
    result = execute(request["project"], cache if request.get("cache") else None)
    # Only computation timing crosses this pipe. Full result transfer is measured over HTTP.
    print(encoded({"metrics": result["metrics"], "engine": result["engine"]}).decode(), flush=True)
