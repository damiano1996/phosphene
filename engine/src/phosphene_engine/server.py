"""HTTP front for the engine, on localhost only (unless `bind` says otherwise, for a phone on the same network). The API itself is in api.py; this file only turns sockets into requests and replies."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .api import Api, Request
from .render_queue import RenderQueue
from .security import Guard
from .userdata import UserStore


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], ConnectionError): return          # the browser left before the answer was written (a reload, a closed tab): nothing to report
        super().handle_error(request, client_address)


def serve(mgr, port: int, token: str, size: int, batch: int, announce=print, web_dir=None, atlas_dir=None, allowed_hosts=(), on_ready=None, bind="127.0.0.1"):
    from . import hardware                     # (PyTorch is only needed by the engine, not by the API)
    api = Api(mgr, Guard(token, allowed_hosts), RenderQueue(mgr, batch), UserStore(mgr.data_dir), size, atlas_dir, web_dir, free_vram=lambda: hardware.detect()["free_mb"])

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *a): pass

        def _answer(self):
            u = urlparse(self.path)
            reply = api.handle(Request(self.command, u.path, parse_qs(u.query), self.headers, self.rfile.read))
            self.send_response(reply.code); self.send_header("Content-Type", reply.ctype); self.send_header("Content-Length", str(len(reply.body)))
            # a picture can be kept for good (its address names its content); everything else is asked again each time
            self.send_header("Cache-Control", "max-age=31536000" if reply.ctype == "image/jpeg" and not reply.headers else "no-store")
            for k, v in reply.headers.items(): self.send_header(k, str(v))
            self.end_headers(); self.wfile.write(reply.body)
            if reply.after: reply.after()

        do_GET = do_POST = do_PUT = _answer

    httpd = None
    for p in ([port] if port == 0 else range(port, port + 10)):          # a fixed port keeps the browser's address (and what it stores for it) the same from one launch to the next; the next ones are the fallback
        try: httpd = Server((bind, p), Handler); break
        except OSError: continue
    if httpd is None: raise SystemExit(f"no free port from {port} on")
    announce(json.dumps({"event": "ready", "port": httpd.server_address[1], "key": mgr.gen.key if mgr.gen else None}), flush=True)
    if on_ready: on_ready(httpd.server_address[1])
    httpd.serve_forever()
