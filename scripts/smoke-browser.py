#!/usr/bin/env python3
"""A real (headless) Chrome walks through the page on a running engine: first run, mosaic, large view, heart, download, cross, settings, what it learned, reload. Prints what happened,
the JavaScript errors it saw, and keeps screenshots. It needs `pip install websocket-client`, Chrome (CHROME=/path/to/chrome, default google-chrome), a fresh engine with SD-Turbo installed:

    scripts/web.sh --no-open --port 8795 --data-dir /tmp/smoke-data &       # a throwaway folder
    scripts/smoke-browser.py 8795 /tmp/smoke-data
"""
import base64, json, os, subprocess, sys, tempfile, threading, time, urllib.request

import websocket

PORT, DATA = sys.argv[1], sys.argv[2]; OUT = tempfile.mkdtemp(prefix="phosphene-smoke-")
TOKEN = open(os.path.join(DATA, "web-token")).read().strip(); W, H = 1280, 720


class Cdp:
    def __init__(self, url):
        self.ws = websocket.create_connection(url, max_size=None); self.ws.settimeout(None); self.n = 0; self.wait = {}; self.on_event = lambda m: None
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        while True:
            try: m = json.loads(self.ws.recv())
            except Exception: return
            if "id" in m and m["id"] in self.wait: self.wait[m["id"]]["res"] = m; self.wait[m["id"]]["ev"].set()
            else: self.on_event(m)

    def call(self, method, **params):
        self.n += 1; i = self.n; w = self.wait[i] = {"ev": threading.Event(), "res": None}
        self.ws.send(json.dumps({"id": i, "method": method, "params": params})); w["ev"].wait(60); r = self.wait.pop(i)["res"]
        if r is None or "error" in r: raise RuntimeError(f"{method}: {r}")
        return r.get("result", {})

    def js(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r: raise RuntimeError(json.dumps(r["exceptionDetails"])[:300])
        return r["result"].get("value")


chrome = subprocess.Popen([os.environ.get("CHROME", "google-chrome"), "--headless=new", "--disable-gpu", "--mute-audio", "--no-first-run", f"--user-data-dir={OUT}/profile", "--remote-debugging-port=9341",
                           f"--window-size={W},{H}", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for _ in range(60):
    try: tab = [t for t in json.load(urllib.request.urlopen("http://127.0.0.1:9341/json")) if t["type"] == "page"][0]; break
    except Exception: time.sleep(0.5)
c = Cdp(tab["webSocketDebuggerUrl"]); errors = []


def on_event(m):
    if m["method"] == "Runtime.exceptionThrown": errors.append(m["params"]["exceptionDetails"].get("exception", {}).get("description", "?")[:300])
    if m["method"] == "Runtime.consoleAPICalled" and m["params"]["type"] == "error": errors.append("console.error: " + " ".join(str(a.get("value", a.get("description", ""))) for a in m["params"]["args"])[:300])


c.on_event = on_event
for call in (("Runtime.enable", {}), ("Page.enable", {}), ("Emulation.setDeviceMetricsOverride", dict(width=W, height=H, deviceScaleFactor=1, mobile=False))): c.call(call[0], **call[1])
shot = lambda name: open(f"{OUT}/{name}.png", "wb").write(base64.b64decode(c.call("Page.captureScreenshot", format="png")["data"]))
say = lambda msg: print(msg, flush=True)


def text_click(sel, rx): return c.js(f"(()=>{{const e=[...document.querySelectorAll({json.dumps(sel)})].find(e=>new RegExp({json.dumps(rx)},'i').test(e.textContent)); if(!e) return false; e.click(); return true}})()")


def until(cond, seconds, what):
    t = time.time()
    while time.time() - t < seconds:
        try:
            if c.js(cond): return True
        except Exception: pass
        time.sleep(0.5)
    say(f"TIMEOUT waiting for {what}"); return False


def click(x, y):
    c.call("Input.dispatchMouseEvent", type="mouseMoved", x=x, y=y); time.sleep(0.1)
    for t in ("mousePressed", "mouseReleased"): c.call("Input.dispatchMouseEvent", type=t, x=x, y=y, button="left", clickCount=1)


try:
    c.call("Page.navigate", url=f"http://127.0.0.1:{PORT}/?t={TOKEN}")
    until("!![...document.querySelectorAll('button')].find(b=>/Use SD-Turbo/.test(b.textContent))", 30, "the first screen"); shot("1-models"); say("first screen: ok")
    text_click("button", "Use SD-Turbo"); until("!![...document.querySelectorAll('.chip')].find(b=>/^flowers$/i.test(b.textContent))", 20, "the categories")
    for cat in ("flowers", "landscapes"): text_click(".chip", f"^{cat}$")
    shot("2-categories"); text_click("button.bigpill", "Start with")
    until("window.__scene && window.__scene() && window.__scene().siteCount > 20 && window.__store.cache.size > 30", 120, "the mosaic"); time.sleep(1.5); shot("3-mosaic")
    say(f"mosaic: {c.js('window.__store.cache.size')} pictures, {round(c.js('window.__fps'))} fps")
    click(W / 2, H / 2 - 20); time.sleep(2.5); say(f"large view opened: {c.js('window.__scene().viewerK') >= 0}"); shot("4-viewer")
    b = c.js("(()=>{const s=window.__scene(), d=s.dens; return {heart:[s.heartBtn.x/d,s.heartBtn.y/d], dl:[s.downloadBtn.x/d,s.downloadBtn.y/d]}})()")
    before = c.js("window.__user.saved.length"); click(*b["heart"]); time.sleep(1.5); say(f"heart saves: {before} -> {c.js('window.__user.saved.length')}")
    c.js("window.__dl=[]; const o=URL.createObjectURL; URL.createObjectURL=b=>{window.__dl.push(b.type+' '+b.size); return o.call(URL,b)}"); click(*b["dl"]); time.sleep(1.5); say(f"download: {c.js('window.__dl')}")
    c.call("Input.dispatchKeyEvent", type="keyDown", key="Escape", code="Escape", windowsVirtualKeyCode=27); c.call("Input.dispatchKeyEvent", type="keyUp", key="Escape", code="Escape", windowsVirtualKeyCode=27); time.sleep(1)
    for _ in range(6):                     # go to a few pictures: something to learn from
        p = c.js("(()=>{const s=window.__scene(), cs=[]; for(let i=0;i<s.siteCount;i++){const q=s.cells[i]; if(!q) continue; let x=0,y=0; const m=q.length/2; for(let v=0;v<m;v++){x+=q[2*v];y+=q[2*v+1]} x/=m*s.dens; y/=m*s.dens; if(window.__store.cache.has(s.siteK[i])&&x>80&&x<innerWidth-80&&y>110&&y<innerHeight-100&&Math.hypot(x-innerWidth/2,y-innerHeight/2)>140) cs.push([x,y])} return cs[Math.floor(Math.random()*cs.length)]})()")
        if p: click(*p); time.sleep(2.2)
    say(f"signals: {c.js('window.__scene().world.model.signals().length')}")
    c.js("window.__scene().hooks.openSettings()"); time.sleep(1); text_click(".navitem", "learned"); time.sleep(1.2); shot("5-learned"); say(f"what it learned: map of {c.js('document.querySelectorAll(\".tg-leaf\").length')} concepts")
    for tab in ("Model", "Pictures", "Categories", "Sound", "Data"): text_click(".navitem", f"^{tab}"); time.sleep(0.4)
    shot("6-data"); c.js("[...document.querySelectorAll('button')].find(b=>/Back/.test(b.textContent))?.click()"); time.sleep(2)
    c.call("Page.reload"); until("window.__scene && window.__scene() && window.__scene().siteCount > 20", 60, "the page after a reload"); time.sleep(1)
    say(f"after a reload: {c.js('window.__user.saved.length')} saved, {c.js('window.__scene().world.model.events')} signals kept")
finally:
    say(f"JavaScript errors: {errors or 'none'}"); say(f"screenshots in {OUT}"); chrome.terminate()
