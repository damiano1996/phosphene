# 6. The browser is the client; the engine serves it

**Decision.** The user interface is a web page (`web/`), served by the engine on `http://127.0.0.1:8780/` and opened in the person's own browser. The Kotlin desktop app that came first was removed once the web client matched it ([0010](0010-remove-the-kotlin-app.md)). The page is plain ES modules with JSDoc (no build step); the pure logic (the world, the geometry, the recommender) lives in `web/js/core` with its tests
(`cd web && node --test`); screens use Preact + htm (one vendored file, `web/vendor`), the mosaic is drawn on a canvas.

**Why.** Installing is then "start the engine": no JVM, no Gradle, and Windows, macOS and Linux share one interface (only the engine depends on the graphics card). The interface can
be tested in a real browser (screenshots, clicks), which the desktop window could not on Wayland. A phone on the same network can use the same page. Contributors know the web.

**How it stays safe.**
- The server binds to 127.0.0.1 only. A page on another site could still reach it by pointing a name of its own at 127.0.0.1 (DNS rebinding), so only the `Host` values `127.0.0.1`,
  `localhost` and `::1` are served, and `POST`/`PUT` also need an `Origin` equal to the `Host`. There is no CORS.
- A key (`web-token` in the data folder, mode 600, kept between launches so the address and the browser's stored state stay the same) is needed for everything but `/health`. The
  first visit, from the link the launcher prints (`/?t=KEY`), sets it as an HttpOnly, SameSite=Strict cookie and redirects to `/`, so it does not stay in the address bar.
- The page is served with a Content-Security-Policy (`default-src 'self'`; images from `blob:`/`data:`). Static files come only from the web folder, only of known types.
- Quit is a button (`POST /quit`): closing the tab does not stop the engine.

**Consequences.**
- A browser allows about six connections to one address and `/img` stays open until the picture is drawn: the client keeps at most four `/img` open and polls `/peek` one at a time.
- What belongs to the person (choices, saved pictures, what was learned) is one JSON file on the engine's side (`GET/PUT /user`), not browser storage: the browser's origin includes the
  port, and clearing the browser must not lose a person's pictures.
- The fixed port has a fallback (the next nine); if it is taken the address changes and the browser starts from the cookie's key again.
- Sound starts at the first click (browsers keep audio off until the page is touched).
