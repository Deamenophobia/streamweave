import os

# Bound native thread usage when several local jobs are active.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run("streamweave_engine.server:app", host="127.0.0.1", port=5191, access_log=False)
