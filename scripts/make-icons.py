#!/usr/bin/env python3
"""Draws the Phosphene logo: a sunflower spiral of 34 dots, warm at the centre and cold at the rim. The same design is the favicon,
the logo in the page and the app icon. Writes web/logo.svg (transparent) and the PNG icons.
  python3 scripts/make-icons.py        (needs Pillow)"""
import math, os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
STOPS = ["#FFF6D6", "#FFD6A0", "#FFB163", "#FA8E67", "#F66F76", "#F25184", "#E14299", "#C944AE", "#A646CF", "#8349EF", "#784AFA"]
GOLDEN = math.pi * (3 - math.sqrt(5))
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def ramp(t, first=0):
    stops = [rgb(s) for s in STOPS[first:]]; x = min(0.9999, max(0.0, t)) * (len(stops) - 1); i = int(x); f = x - i
    return tuple(round(stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f) for c in range(3))


def dots(n, lo, hi, first=0):
    """[(x, y, r, (r, g, b))] in a unit circle: centred (the spiral's centre of mass is at the origin), outermost edge at 0.94."""
    pts = [(math.sqrt(k + 0.5), k * GOLDEN) for k in range(n)]
    cx = sum(r * math.cos(a) for r, a in pts) / n; cy = sum(r * math.sin(a) for r, a in pts) / n
    grow = lambda t: lo + (hi - lo) * t           # share of the spacing: nearly touching, the rim dots a little bigger as in the app icon, so the arms of the spiral read
    raw = []
    for k, (r, a) in enumerate(pts):
        t = k / (n - 1); raw.append((r * math.cos(a) - cx, r * math.sin(a) - cy, 1.9046 * grow(t), ramp(t, first)))
    reach = max(math.hypot(x, y) + rr for x, y, rr, _ in raw)
    return [(x * 0.94 / reach, y * 0.94 / reach, rr * 0.94 / reach, c) for x, y, rr, c in raw]


def svg(path, n, lo, hi, first=0):
    body = "".join(f'<circle cx="{x:.4f}" cy="{y:.4f}" r="{r:.4f}" fill="#{c[0]:02X}{c[1]:02X}{c[2]:02X}"/>' for x, y, r, c in dots(n, lo, hi, first))
    open(path, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 2 2">{body}</svg>\n')


def png(size, n, lo, hi, first=0, background=True, fill=0.74, ss=4):
    W = size * ss; img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    if background:                                                         # the app icon's dark radial background, in a rounded square
        g = Image.new("RGB", (216, 216)); gp = g.load(); c0 = (0x1A, 0x14, 0x42); c1 = (0x07, 0x06, 0x1A)
        for y in range(216):
            for x in range(216):
                d = min(1.0, math.hypot(x - 108, y - 108) / 152); gp[x, y] = tuple(int(c0[i] + (c1[i] - c0[i]) * d) for i in range(3))
        bg = g.resize((W, W), Image.BICUBIC).convert("RGBA"); mask = Image.new("L", (W, W), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, W - 1), radius=int(W * 0.22), fill=255); img.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(img); k = W / 2 * (fill if background else 0.98)
    for x, y, r, c in dots(n, lo, hi, first):
        px, py, pr = W / 2 + x * k, W / 2 + y * k, r * k; d.ellipse((px - pr, py - pr, px + pr, py + pr), fill=c + (255,))
    return img.resize((size, size), Image.LANCZOS)


LOGO = dict(n=34, lo=0.27, hi=0.40, first=1)          # one design for every size: 34 dots, with a gap between them (dots about 55 to 80 percent of the spacing) so the spiral reads and the dots breathe


if __name__ == "__main__":
    web = os.path.join(ROOT, "web")
    svg(os.path.join(web, "logo.svg"), LOGO["n"], LOGO["lo"], LOGO["hi"], LOGO["first"])           # the logo, in the page and as the favicon
    for name, size in (("icon.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)): png(size, **LOGO).save(os.path.join(web, name))        # on the dark background
    png(64, **LOGO, background=False).save(os.path.join(web, "favicon.png"))             # transparent (browsers without SVG favicons)
