#!/usr/bin/env python3
"""Local test server: serves the site and runs Python with CPython instead of Pyodide.

    python3 tools/devserver.py 8000
    open http://localhost:8000/code/?runner=local

The pages talk to POST /__run with exactly the requests the Pyodide worker gets, and
this server answers with learn/harness.py, so tests exercise the real harness.
"""
import http.server
import json
import os
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["MPLBACKEND"] = "Agg"
sys.path.insert(0, os.path.join(ROOT, "learn"))
os.chdir(os.path.join(ROOT, "learn"))
import harness  # noqa: E402

LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path != "/__run":
            self.send_error(404)
            return
        n = int(self.headers.get("Content-Length", 0))
        req = json.loads(self.rfile.read(n))
        with LOCK:
            res = harness.handle(req)
        body = json.dumps(res).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"serving {ROOT} on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("", port), Handler).serve_forever()
