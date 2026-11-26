"""Build the app icon (1024x1024) from the game's own pixels: CC0 floor tiles from
0x72's DungeonTileset II, the CC0 dwarf, the hand-pixelled torch, grave slab and arrow, and the same
banded, dithered torchlight the game uses. Nothing generated.

Usage: python3 -I tools/build_icon.py   ->  assets/icon.png
"""
import os
import re

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(ROOT, 'src', 'client', 'assets', 'dungeon.png')
FRAMES_TS = os.path.join(ROOT, 'src', 'client', 'engine', 'atlas.ts')
OUT = os.path.join(ROOT, 'assets', 'icon.png')
N = 32  # pixel canvas; scaled 32x to 1024

SLAB = ['.oooooooooo.', 'oHHHHHHHHHHo', 'oHLLLLLLLLMo', 'oHLLLLLLLLMo', 'oHLLLLLLLLMo', 'oHLLLLLLLLMo',
        'oHLLLLLLLLMo', 'oHLLLLLLLLMo', 'oHLLLLLLLLMo', 'oHLLLLLLLLMo', 'oMMMMMMMMMMo', '.oooooooooo.']
# the game's arrow (sprites.ts ARROW_UP) turned to point left, at the dwarf: a warning, or a lie?
ARROW = ['...#...', '..##...', '.######', '#######', '.######', '..##...', '...#...']
COL = {'o': (34, 34, 34), 'H': (211, 191, 169), 'L': (170, 141, 122), 'M': (119, 92, 85),
       'gold': (225, 154, 67), 'ink': (34, 34, 34)}
BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]


def frame(atlas, frames, name):
    sx, sy, w, h = frames[name]
    return atlas.crop((sx, sy, sx + w, sy + h))


def hexc(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def put(px, x, y, c):
    if 0 <= x < N and 0 <= y < N:
        px[x, y] = c + (255,)


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    frames = {m[0]: tuple(map(int, m[1:])) for m in re.findall(r'(\w+): \[(\d+), (\d+), (\d+), (\d+)\]', open(FRAMES_TS).read())}
    img = Image.new('RGBA', (N, N), (6, 7, 11, 255))
    # the floor, offset so a seam runs under the slab like a real stone
    for (x, y), name in {(-4, 0): 'floor_1', (12, 0): 'floor_3', (28, 0): 'floor_2', (-4, 16): 'floor_2', (12, 16): 'floor_1', (28, 16): 'floor_3'}.items():
        img.alpha_composite(frame(atlas, frames, name), (x, y))
    px = img.load()
    # a slab on the stone at his feet, a gold arrow carved into it (a truth, or a lie?)
    ox, oy = 19, 19
    carved = set()  # the arrow catches the torchlight, so it stays bright
    for y, row in enumerate(SLAB):
        for x, ch in enumerate(row):
            if ch != '.':
                # the slab's face a shade darker than in the game, so the carving reads at icon size
                put(px, ox + x, oy + y, COL['M'] if ch == 'L' else COL[ch])
    for y, row in enumerate(ARROW):
        for x, ch in enumerate(row):
            if ch == '#':
                put(px, ox + 2 + x, oy + 3 + y, COL['ink'])
    for y, row in enumerate(ARROW):
        for x, ch in enumerate(row):
            if ch == '#':
                put(px, ox + 2 + x, oy + 2 + y, (255, 210, 122))
                carved.add((ox + 2 + x, oy + 2 + y))
    # the dwarf (0x72, CC0) standing beside it
    hx, hy = 0, 2
    img.alpha_composite(frame(atlas, frames, 'dwarf_m_idle_anim_f0'), (hx, hy))
    px = img.load()
    # his torch, held out from the hand exactly as in the game: a dark stick, a bright flame
    tx, ty = hx + 15, hy + 17 - 11
    ink, w2, w3, w4, w5, w6 = (hexc(c) for c in ('#222222', '#7c4223', '#b06a2e', '#e19a43', '#ffd27a', '#fff1c2'))
    for y in range(ty, ty + 12):
        put(px, tx - 1, y, ink); put(px, tx, y, w2); put(px, tx + 1, y, ink)
    FLAME = [(-1, -2, w4), (0, -2, w5), (1, -2, w4), (-1, -1, w5), (0, -1, w6), (1, -1, w5), (0, -3, w5), (0, -4, w4),
             (-1, -3, w4), (1, -3, w4), (0, 0, w6), (-1, 0, w4), (1, 0, w4)]
    for x, y, c in FLAME:
        put(px, tx + x, ty + y, c)
    flame = {(tx + x, ty + y) for x, y, _ in FLAME}
    # torchlight: banded and dithered as in the game, falling to black at the edges
    cx, cy, R = tx, ty + 7, 20.0
    for y in range(N):
        for x in range(N):
            if (x, y) in flame:
                continue
            lift = 1.25 if (x, y) in carved else 1.0  # the flame is its own light
            d = ((x - cx) ** 2 + (y - cy) ** 2) / (R * R)
            light = max(0.0, (1 - d)) ** 1.6 * 1.35 + 0.02
            th = (BAYER[(x & 3) | ((y & 3) << 2)] + 0.5) / 16
            k = min(1.1, int(light * 6 + th) / 6) * lift
            r, g, b, a = px[x, y]
            px[x, y] = (min(255, int(r * k)), min(255, int(g * k * 0.8)), min(255, int(b * k * 0.58)), 255)
    img.resize((1024, 1024), Image.NEAREST).convert('RGB').save(OUT, optimize=True)
    print('icon ->', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
