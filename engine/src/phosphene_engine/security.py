"""Who may talk to the engine.

The server only listens on 127.0.0.1, but a page on another site could still reach it (DNS rebinding: a name of its own pointed at 127.0.0.1). So:
  * only our own host names are served (`host_ok`),
  * a request that changes something must come from our own origin (`origin_ok`),
  * and every request carries the secret, in the address (`?t=`) or in the cookie that the first visit sets (`authorised`).
There is no CORS: nothing from another origin is ever allowed to read an answer."""
import hmac

COOKIE = "phosphene"
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1")


class Guard:
    def __init__(self, token: str, allowed_hosts=()):
        self.token = token                          # "" only for local experiments (--insecure-no-token)
        self.allowed_hosts = tuple(allowed_hosts)

    def host_ok(self, headers) -> bool:
        host = (headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        return host in LOCAL_HOSTS or any(host == a or (a.startswith(".") and host.endswith(a)) for a in self.allowed_hosts)    # ".example.com" allows every name under it

    @staticmethod
    def origin_ok(headers) -> bool:
        o = headers.get("Origin")
        return o is None or o.split("://", 1)[-1] == headers.get("Host")

    def authorised(self, headers, query) -> bool:
        if not self.token: return True
        return hmac.compare_digest(query.get("t", [""])[0], self.token) or hmac.compare_digest(self._cookie(headers), self.token)

    def session_cookie(self) -> str:
        return f"{COOKIE}={self.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000"

    @staticmethod
    def _cookie(headers) -> str:
        for part in (headers.get("Cookie") or "").split(";"):
            k, _, val = part.strip().partition("=")
            if k == COOKIE: return val
        return ""
