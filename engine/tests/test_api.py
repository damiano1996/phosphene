"""The HTTP API without a server and without PyTorch: security, the person's data, saved pictures, pictures, the page."""
import json
import os
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from phosphene_engine.api import Api, Request
from phosphene_engine.security import Guard
from phosphene_engine.userdata import UserStore

TOKEN = "s3cret"
H = {"Host": "127.0.0.1:8780"}


class FakeGen:
    key = "1.fake.vae"; backend = SimpleNamespace(id="fake", vae="vae"); variants = 1; lazy = False


class FakeRenders:
    def __init__(self): self.drawn = []
    def key_of(self, gen, z, seed, s): return f"{seed}-{s}"
    def fetch_jpg(self, gen, z, seed, s): self.drawn.append((seed, s)); return b"\xff\xd8jpeg"
    def peek(self, key, raw): return False
    def snapshot(self): return {"generated": 0}
    def cache_path(self, gen, key): return "/nonexistent"


class FakeMgr:
    def __init__(self, data_dir, gen=None):
        self.data_dir, self.gen = data_dir, gen
        self.atlas = SimpleNamespace(dim=3, version=7)
        self.activation = {"phase": "idle"}; self.cap = None
        self.attrs = SimpleNamespace(all=lambda: [], nature=[], base=[], capacity=96)
        self.activated = []
    def listing(self): return {"models": []}
    def look_words(self): return []
    def activate(self, mid):
        if mid == "nope": raise KeyError(mid)
        self.activated.append(mid)


@pytest.fixture
def env():
    with tempfile.TemporaryDirectory() as d:
        web = os.path.join(d, "web"); os.makedirs(os.path.join(web, "test")); os.makedirs(os.path.join(web, "tools")); os.makedirs(os.path.join(d, "data"))
        Path(os.path.join(web, "index.html")).write_text("<html>hi</html>"); Path(os.path.join(web, "app.js")).write_text("1")
        Path(os.path.join(web, "test", "x.js")).write_text("secret test"); Path(os.path.join(web, "package.json")).write_text("{}"); Path(os.path.join(web, "tools", "t.js")).write_text("t")
        Path(os.path.join(d, "outside.js")).write_text("outside")
        mgr = FakeMgr(os.path.join(d, "data"), FakeGen()); renders = FakeRenders(); users = UserStore(mgr.data_dir)
        api = Api(mgr, Guard(TOKEN), renders, users, 512, atlas_dir=None, web_dir=web, free_vram=lambda: 1234)
        yield SimpleNamespace(api=api, mgr=mgr, renders=renders, users=users, web=web, dir=d)


class _Headers(dict):
    def get(self, k, d=None): return super().get(k, d)


def call(env, method, path, query=None, headers=None, body=b""):
    q = {k: [v] for k, v in (query or {}).items()}
    return env.api.handle(Request(method, path, q, _Headers({**H, **(headers or {})}), lambda n: body[:n]))


def authed(extra=None): return {"t": TOKEN, **(extra or {})}


# ------------------------------------------------------------------------------------------------ who may ask
def test_health_is_open_but_names_other_than_ours_are_refused(env):
    assert call(env, "GET", "/health").code == 200
    assert json.loads(call(env, "GET", "/health").body)["vram_free_mb"] == 1234
    assert call(env, "GET", "/health", headers={"Host": "evil.example:8780"}).code == 403          # DNS rebinding


def test_everything_else_needs_the_secret_in_the_address_or_the_cookie(env):
    assert call(env, "GET", "/models").code == 403
    assert call(env, "GET", "/models", {"t": "wrong"}).code == 403
    assert call(env, "GET", "/models", authed()).code == 200
    assert call(env, "GET", "/models", headers={"Cookie": f"phosphene={TOKEN}"}).code == 200


def test_changes_must_come_from_our_own_origin(env):
    assert call(env, "POST", "/models/activate", authed({"id": "a"}), headers={"Origin": "http://evil.example"}).code == 403
    assert call(env, "POST", "/models/activate", authed({"id": "a"}), headers={"Origin": "http://127.0.0.1:8780"}).code == 200
    assert env.mgr.activated == ["a"]
    assert call(env, "POST", "/models/activate", authed({"id": "nope"})).code == 400          # the caller's mistake, not a crash
    assert call(env, "POST", "/models/activate", {"id": "a"}).code == 403


def test_the_first_visit_sets_the_cookie(env):
    r = call(env, "GET", "/", {"t": TOKEN})
    assert r.code == 302 and "HttpOnly" in r.headers["Set-Cookie"] and "SameSite=Strict" in r.headers["Set-Cookie"] and TOKEN in r.headers["Set-Cookie"]
    assert call(env, "GET", "/").code == 403


# ------------------------------------------------------------------------------------------------ the page
def test_the_page_is_served_and_nothing_else_of_the_disk(env):
    c = {"Cookie": f"phosphene={TOKEN}"}
    assert call(env, "GET", "/", headers=c).body == b"<html>hi</html>"
    assert "Content-Security-Policy" in call(env, "GET", "/", headers=c).headers
    assert call(env, "GET", "/app.js", headers=c).code == 200
    for bad in ("/test/x.js", "/tools/t.js", "/package.json", "/../outside.js", "/%2e%2e/outside.js", "/app.py", "/nothing.js"):
        assert call(env, "GET", bad, headers=c).code == 404, bad


# ------------------------------------------------------------------------------------------------ the person's data
def test_a_page_that_outlives_a_reset_cannot_write_its_old_state_back(env):
    r = call(env, "GET", "/user", authed()); epoch = r.headers["X-Epoch"]
    assert r.body == b"{}"
    assert call(env, "PUT", "/user", authed(), body=b'{"a":1}').code == 409                                    # no epoch
    assert call(env, "PUT", "/user", authed(), {"X-Epoch": "old", "Content-Length": "7"}, b'{"a":1}').code == 409
    assert call(env, "PUT", "/user", authed(), {"X-Epoch": epoch, "Content-Length": "7"}, b'{"a":1}').code == 200
    assert call(env, "GET", "/user", authed()).body == b'{"a":1}'
    assert call(env, "PUT", "/user", authed(), {"X-Epoch": epoch, "Content-Length": "3"}, b"abc").code == 400
    assert call(env, "PUT", "/user", authed(), {"X-Epoch": epoch, "Content-Length": str(17 * 1024 * 1024)}).code == 413


def test_a_fresh_folder_has_a_new_epoch_and_an_existing_one_keeps_its_epoch(env):
    first = env.users.epoch
    assert UserStore(env.mgr.data_dir).epoch != first                      # no user.json yet: a fresh start
    env.users.write(b"{}")
    assert UserStore(env.mgr.data_dir).epoch == UserStore(env.mgr.data_dir).epoch


# ------------------------------------------------------------------------------------------------ pictures
def test_saved_pictures_are_copies_kept_until_removed(env):
    cell = {"z": "0.1,0.2,0.3", "seed": "5", "v": FakeGen.key, "s": "512"}
    r = call(env, "POST", "/saved/add", authed(cell)); assert r.code == 200
    sid = json.loads(r.body)["id"]
    assert call(env, "GET", f"/saved/{sid}.jpg", authed()).body == b"\xff\xd8jpeg"
    assert call(env, "POST", "/saved/remove", authed({"id": sid})).code == 200
    assert call(env, "GET", f"/saved/{sid}.jpg", authed()).code == 404
    assert call(env, "POST", "/saved/remove", authed({"id": "../../etc/passwd"})).code == 400
    assert call(env, "POST", "/saved/add", authed({**cell, "v": "old-key"})).code == 409


def test_a_picture_request_is_checked_before_anything_is_drawn(env):
    ok_q = {"z": "0.1,0.2,0.3", "seed": "5", "v": FakeGen.key}
    assert call(env, "GET", "/img", authed(ok_q)).code == 200 and env.renders.drawn == [(5, 512)]
    assert call(env, "GET", "/img", authed({**ok_q, "v": "other"})).code == 409
    assert call(env, "GET", "/img", authed({**ok_q, "z": "0.1,0.2"})).code == 400            # wrong number of dimensions
    assert call(env, "GET", "/img", authed({**ok_q, "s": "100"})).code == 400                # not a multiple of 8
    env.mgr.gen = None
    assert call(env, "GET", "/img", authed(ok_q)).code == 503


def test_peek_says_when_nothing_is_being_drawn(env):
    assert call(env, "GET", "/peek", authed({"z": "0.1,0.2,0.3", "seed": "5", "v": FakeGen.key})).code == 404


def test_an_extra_host_name_is_served_only_when_allowed():
    from phosphene_engine.security import Guard
    g = Guard("k", [".example.com", "me.example.org"])
    ok = lambda h: g.host_ok({"Host": h})
    assert ok("abc.example.com") and ok("me.example.org:443") and ok("localhost:8780")
    assert not ok("example.com.evil.com") and not ok("evil.org") and not ok("xme.example.org")
