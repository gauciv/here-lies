"""Pixelate the CC0 "Scroll UI Container" (Chloe Wolfe, opengameart.org/content/scroll-ui-container)
into a small-palette pixel scroll that matches the rest of the game.

Usage: python3 -I tools/build_scroll.py path/to/container.png
Writes src/client/assets/ui/scroll.png (used as a 9-slice: rolls top and bottom).
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'client', 'assets', 'ui', 'scroll.png')
WIDTH = 128
INK = (58, 36, 20, 255)


def main(src: str) -> None:
    im = Image.open(src).convert('RGBA')
    im = im.crop(im.getbbox())
    h = round(im.height * WIDTH / im.width)
    small = im.resize((WIDTH, h), Image.BOX)
    # hard alpha, like every other sprite
    px = small.load()
    for y in range(h):
        for x in range(WIDTH):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255) if a >= 140 else (0, 0, 0, 0)
    # age the paper a touch warmer and darker, then snap to a small palette
    rgb = Image.new('RGB', small.size, (0, 0, 0))
    rgb.paste(small, mask=small.split()[3])
    r, g, b = rgb.split()
    rgb = Image.merge('RGB', (r.point(lambda v: int(v * 0.97)), g.point(lambda v: int(v * 0.84)), b.point(lambda v: int(v * 0.62))))
    q = rgb.quantize(colors=11, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = Image.new('RGBA', small.size, (0, 0, 0, 0))
    out.paste(q, mask=small.split()[3])
    # one-pixel ink outline around the shape
    o = out.load()
    edge = []
    for y in range(h):
        for x in range(WIDTH):
            if o[x, y][3] == 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < WIDTH and 0 <= ny < h) or o[nx, ny][3] == 0:
                    edge.append((x, y))
                    break
    for x, y in edge:
        o[x, y] = INK
    out.save(OUT, optimize=True)
    print('scroll', out.size, '->', OUT)


if __name__ == '__main__':
    main(sys.argv[1])
