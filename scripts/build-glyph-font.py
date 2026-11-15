"""Builds src/assets/astro-glyphs.woff: the Capricorn and Pluto variants of
reference 2 in the visual wheel specification of 15 November 2026.

No font on Windows has this Capricorn, so both glyphs are drawn here and
shipped with the program. They sit on the code points of the ordinary
symbols (U+2651, U+2647), and the font is listed ahead of Segoe UI Symbol,
whose proportions they follow: cap height 0.70 em, zodiac strokes heavier
than planet strokes.

Needs fonttools:  pip install fonttools
Run from the repository root:  python scripts/build-glyph-font.py
"""

import math
import os

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

EM = 1000
# Vertical metrics of Segoe UI Symbol, so centring behaves like its glyphs.
ASCENT, DESCENT = 1079, 255
ZODIAC_STROKE = 85
PLANET_STROKE = 65
STEPS = 72


def area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def solid(points):
    """Clockwise, which TrueType fills."""
    return points if area(points) < 0 else points[::-1]


def hole(points):
    return solid(points)[::-1]


def circle(cx, cy, r):
    return [
        (cx + r * math.cos(2 * math.pi * i / STEPS), cy + r * math.sin(2 * math.pi * i / STEPS))
        for i in range(STEPS)
    ]


def ring(cx, cy, r, stroke):
    """A circle line of the given stroke, centred on radius r."""
    return [solid(circle(cx, cy, r + stroke / 2)), hole(circle(cx, cy, r - stroke / 2))]


def stroke_path(points, stroke):
    """The outline of a line through the points, with flat ends."""
    left, right = [], []
    for i, (x, y) in enumerate(points):
        ax, ay = points[max(i - 1, 0)]
        bx, by = points[min(i + 1, len(points) - 1)]
        length = math.hypot(bx - ax, by - ay)
        nx, ny = -(by - ay) / length, (bx - ax) / length
        left.append((x + nx * stroke / 2, y + ny * stroke / 2))
        right.append((x - nx * stroke / 2, y - ny * stroke / 2))
    return solid(left + right[::-1])


def rect(x0, y0, x1, y1):
    return solid([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


def capricorn():
    """A flat top bar, a diagonal down to the left, and a loop below it."""
    s = ZODIAC_STROKE
    top = 760
    left, right = 70, 680
    cx, cy, r = 375, 215, 240
    # The diagonal leaves the right end of the bar and runs into the loop as
    # a tangent on its upper left side.
    px, py = right - s / 2, top - s / 2
    distance = math.hypot(px - cx, py - cy)
    toward = math.atan2(py - cy, px - cx)
    touch = toward + math.acos(r / distance)
    tx, ty = cx + r * math.cos(touch), cy + r * math.sin(touch)
    return [
        rect(left, top - s, right, top),
        rect(left, top - 180, left + s, top),
        stroke_path([(px, py), (tx, ty)], s),
        *ring(cx, cy, r, s),
    ]


def pluto():
    """Pluto form five (U+2BD6): a circle with a crescent on its right side."""
    s = PLANET_STROKE
    cx, cy, r = 370, 350, 297
    # The crescent's inner edge: half an ellipse whose ends lie on the circle.
    offset, bulge = 65, 115
    half = math.sqrt(r * r - offset * offset)
    arc = [
        (cx + offset + bulge * math.cos(t), cy + half * math.sin(t))
        for t in (math.pi * (i / 36 - 0.5) for i in range(37))
    ]
    return [*ring(cx, cy, r, s), stroke_path(arc, s)]


def build(path):
    glyphs = {".notdef": [], "capricorn": capricorn(), "pluto": pluto()}
    builder = FontBuilder(EM, isTTF=True)
    builder.setupGlyphOrder(list(glyphs))
    builder.setupCharacterMap({0x2651: "capricorn", 0x2647: "pluto"})
    drawn, metrics = {}, {}
    for name, contours in glyphs.items():
        pen = TTGlyphPen(None)
        for contour in contours:
            points = [(round(x), round(y)) for x, y in contour]
            pen.moveTo(points[0])
            for point in points[1:]:
                pen.lineTo(point)
            pen.closePath()
        drawn[name] = pen.glyph()
        xs = [round(x) for contour in contours for x, _ in contour]
        # The same space on both sides as on the left.
        metrics[name] = (max(xs) + min(xs), min(xs)) if xs else (500, 0)
    builder.setupGlyf(drawn)
    builder.setupHorizontalMetrics(metrics)
    builder.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT)
    builder.setupNameTable({"familyName": "Astro Glyphs", "styleName": "Regular"})
    builder.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=-DESCENT,
        sTypoLineGap=0,
        usWinAscent=ASCENT,
        usWinDescent=DESCENT,
    )
    builder.setupPost()
    builder.font.flavor = "woff"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    builder.save(path)


if __name__ == "__main__":
    build(os.path.join("src", "assets", "astro-glyphs.woff"))
    print("wrote src/assets/astro-glyphs.woff")
