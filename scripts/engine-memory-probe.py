"""Sample one explicitly selected engine process; used only by the benchmark."""

import json
import sys
from threading import Event, Lock, Thread

import psutil

process = psutil.Process(int(sys.argv[1]))
lock, stopping = Lock(), Event()
baseline = peak = process.memory_info().rss


def sample():
    global peak
    while not stopping.wait(0.02):
        try:
            resident = process.memory_info().rss
        except psutil.NoSuchProcess:
            return
        with lock:
            peak = max(peak, resident)


thread = Thread(target=sample, daemon=True)
thread.start()
try:
    for line in sys.stdin:
        with lock:
            if line.strip() == "reset":
                baseline = peak = process.memory_info().rss
            print(
                json.dumps({"baselineRssBytes": baseline, "peakRssBytes": peak}),
                flush=True,
            )
finally:
    stopping.set()
    thread.join()
