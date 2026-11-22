"""Build the app icon (1024x1024) from the game's own pixels: CC0 floor tiles from
0x72's DungeonTileset II, the hand-pixelled grave slab and arrow, and the same
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
ARROW = ['..#####', '...####', '....###', '...####', '..###.#', '.###...', '###....']
COL = {'o': (34, 34, 34), 'H': (211, 191, 169), 'L': (170, 141, 122), 'M': (119, 92, 85),
       'gold': (225, 154, 67), 'ink': (34, 34, 34)}
BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]


def frame(atlas, frames, name):
    sx, sy, w, h = frames[name]
    return atlas.crop((sx, sy, sx + w, sy + h))


def main() -> None:
    atlas = Image.open(ATLAS).convert('RGBA')
    frames = {m[0]: tuple(map(int, m[1:])) for m in re.findall(r'(\w+): \[(\d+), (\d+), (\d+), (\d+)\]', open(FRAMES_TS).read())}
    img = Image.new('RGBA', (N, N), (6, 7, 11, 255))
    for (x, y), name in {(0, 0): 'floor_1', (16, 0): 'floor_3', (0, 16): 'floor_2', (16, 16): 'floor_1'}.items():
        img.alpha_composite(frame(atlas, frames, name), (x, y))
    px = img.load()
    # the slab, centred, with a gold arrow carved into it (a truth, or a lie?)
    ox, oy = 10, 10
    for y, row in enumerate(SLAB):
        for x, ch in enumerate(row):
            if ch != '.':
                px[ox + x, oy + y] = COL[ch] + (255,)
    for y, row in enumerate(ARROW):
        for x, ch in enumerate(row):
            if ch == '#':
                px[ox + 3 + x, oy + 3 + y] = COL['ink'] + (255,)
    for y, row in enumerate(ARROW):
        for x, ch in enumerate(row):
            if ch == '#':
                px[ox + 2 + x, oy + 2 + y] = COL['gold'] + (255,)
    # torchlight: banded and dithered, the dark closing in at the corners
    cx, cy, R = 16, 15, 17.0
    for y in range(N):
        for x in range(N):
            d = ((x - cx) ** 2 + (y - cy) ** 2) / (R * R)
            light = max(0.0, (1 - d)) ** 2 * 1.3 + 0.04
            th = (BAYER[(x & 3) | ((y & 3) << 2)] + 0.5) / 16
            k = min(1.05, int(light * 6 + th) / 6)
            r, g, b, a = px[x, y]
            px[x, y] = (min(255, int(r * k * 1.0)), min(255, int(g * k * 0.78)), min(255, int(b * k * 0.52)), 255)
    img.resize((1024, 1024), Image.NEAREST).convert('RGB').save(OUT, optimize=True)
    print('icon ->', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    main()
