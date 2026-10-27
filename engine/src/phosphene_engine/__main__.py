"""python -m phosphene_engine --port 0 --atlas-dir ../atlas --data-dir ~/.local/share/phosphene

The token comes from the environment (PHOSPHENE_TOKEN), not the command line, so it does not show in the process list. The first line printed on
stdout once the engine is up is a JSON object with the port it bound to (use --port 0 to let the system pick a free one)."""
import argparse
import os
import sys

import torch
from .util import default_data_dir, read_text


def main():
    ap = argparse.ArgumentParser(prog="phosphene-engine")
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--atlas-dir", required=True)
    ap.add_argument("--data-dir", default=default_data_dir())
    ap.add_argument("--model", default="none", help="a model id to load at start, or none (the default): the app chooses through /models")
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--batch", type=int, default=4)
    ap.add_argument("--insecure-no-token", action="store_true", help="only for local experiments")
    ap.add_argument("--web", action="store_true", help="serve the web client and open it in the browser; the key is kept in the data folder, so the same address keeps working")
    ap.add_argument("--web-dir", default=None, help="the web client's folder (default: ../web next to the atlas folder)")
    ap.add_argument("--no-open", action="store_true", help="with --web: do not open the browser")
    ap.add_argument("--allow-host", action="append", default=[], metavar="NAME", help="also answer to this host name (repeatable; a leading dot allows all names under it, e.g. .example.org). The key is still required")
    ap.add_argument("--bind", default="127.0.0.1", help="the address to listen on; 0.0.0.0 lets other devices on your network in (then also --allow-host <this computer's address>). The key is still required, but the traffic is not encrypted")
    args = ap.parse_args()
    token = os.environ.get("PHOSPHENE_TOKEN", "")
    if args.web:
        if args.port == 0: args.port = 8780
        os.makedirs(args.data_dir, exist_ok=True); tf = os.path.join(args.data_dir, "web-token")
        if not token:
            if os.path.exists(tf): token = read_text(tf).strip()
            if not token:
                import secrets
                token = secrets.token_hex(16); fd = os.open(tf, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600); os.write(fd, token.encode()); os.close(fd)
    if not token and not args.insecure_no_token:
        sys.exit("PHOSPHENE_TOKEN is not set (or pass --insecure-no-token)")
    from .atlas import Atlas
    from .manager import Manager
    from .server import serve
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    if device == "cpu": print("warning: no supported graphics chip found (NVIDIA CUDA, or Apple Silicon); no model can run here", flush=True)
    mgr = Manager(Atlas(args.atlas_dir), args.data_dir, device)
    if args.model != "none":                       # load this model at start (it must be installed); with "none" the app picks one through /models
        mgr.activate(args.model)
        import time
        while mgr.activation["phase"] in ("loading", "encoding"): time.sleep(0.3)
        if mgr.activation["phase"] == "error": sys.exit(mgr.activation["message"])
    web_dir = args.web_dir or (os.path.join(os.path.dirname(os.path.abspath(args.atlas_dir)), "web") if args.web else None)
    if web_dir and not os.path.isdir(web_dir): sys.exit(f"web folder not found: {web_dir}")

    def ready(port):
        if not args.web: return
        url = f"http://127.0.0.1:{port}/?t={token}"
        print(f"Phosphene is at {url}", flush=True)
        if not args.no_open:
            import webbrowser
            webbrowser.open(url)
    serve(mgr, args.port, token, args.size, args.batch, web_dir=web_dir, atlas_dir=os.path.abspath(args.atlas_dir), allowed_hosts=[h.lower() for h in args.allow_host], bind=args.bind, on_ready=ready)


if __name__ == "__main__":
    main()
