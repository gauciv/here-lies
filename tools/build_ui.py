"""Generate the pixel-art UI chrome (stone tablet panels, plate buttons, brick
texture) in the palette of 0x72's DungeonTileset II, pre-scaled for crisp CSS
border-image use.

Usage: python3 tools/build_ui.py <path to 0x72_DungeonTilesetII_v1.7>
"""
import os
import sys
from PIL import Image

SCALE = 3
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'client', 'assets', 'ui')

INK = (0x22, 0x22, 0x22, 255)
VOID = (0x11, 0x11, 0x11, 255)
STONE_D = (0x48, 0x3B, 0x3A, 255)
STONE_M = (0x77, 0x5C, 0x55, 255)
STONE_L = (0xAA, 0x8D, 0x7A, 255)
STONE_H = (0xD3, 0xBF, 0xA9, 255)
FACE = (0x1F, 0x19, 0x18, 255)
CLEAR = (0, 0, 0, 0)

# plates: (top highlight, face, lower shade, bottom edge)
PLATES = {
    'button': ((0xD3, 0xBF, 0xA9, 255), STONE_L, STONE_M, STONE_D),
    'button-hot': ((0xFF, 0xE0, 0x8A, 255), (0xF0, 0x9A, 0x3E, 255), (0xC4, 0x5C, 0x24, 255), (0x8F, 0x40, 0x29, 255)),
    'button-red': ((0xF0, 0x8A, 0x70, 255), (0xDA, 0x4E, 0x38, 255), (0x9F, 0x29, 0x4E, 255), (0x62, 0x23, 0x2F, 255)),
    'button-dark': ((0x77, 0x5C, 0x55, 255), STONE_D, (0x35, 0x2B, 0x2A, 255), (0x26, 0x1F, 0x1E, 255)),
}


def up(im: Image.Image) -> Image.Image:
    return im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)


def panel() -> Image.Image:
    """11x11 stone tablet frame; 4px slices. Light cap on top like the wall."""
    w = h = 11
    im = Image.new('RGBA', (w, h), FACE)
    px = im.load()
    for x in range(w):
        for y in range(h):
            edge = x in (0, w - 1) or y in (0, h - 1)
            if edge:
                px[x, y] = INK
            elif y == 1:
                px[x, y] = STONE_H
            elif y == 2:
                px[x, y] = STONE_L
            elif y == 3:
                px[x, y] = STONE_M
            elif y == h - 2:
                px[x, y] = VOID
            elif x == 1:
                px[x, y] = STONE_D
            elif x == w - 2:
                px[x, y] = STONE_D
    for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        px[x, y] = CLEAR
    return up(im)


def plate(colors) -> Image.Image:
    """9x9 raised plate; 3px slices. Two-pixel lower shade reads as depth."""
    hi, face, shade, low = colors
    w = h = 9
    im = Image.new('RGBA', (w, h), face)
    px = im.load()
    for x in range(w):
        for y in range(h):
            if x in (0, w - 1) or y in (0, h - 1):
                px[x, y] = INK
            elif y == 1:
                px[x, y] = hi
            elif y == h - 2:
                px[x, y] = low
            elif y == h - 3:
                px[x, y] = shade
    for (x, y) in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        px[x, y] = CLEAR
    return up(im)


def bricks(src: str) -> Image.Image:
    """The tileset's own wall bricks, sunk into shadow for a tablet face."""
    tile = Image.open(os.path.join(src, 'frames', 'wall_mid.png')).convert('RGBA')
    remap = {
        STONE_D[:3]: (0x26, 0x1F, 0x1E),
        STONE_M[:3]: (0x30, 0x27, 0x25),
        INK[:3]: (0x1A, 0x15, 0x14),
    }
    out = Image.new('RGBA', tile.size)
    for x in range(tile.width):
        for y in range(tile.height):
            r, g, b, a = tile.getpixel((x, y))
            nr, ng, nb = remap.get((r, g, b), (0x22, 0x1C, 0x1B))
            out.putpixel((x, y), (nr, ng, nb, 255))
    return up(out)


def main(src: str) -> None:
    os.makedirs(OUT, exist_ok=True)
    panel().save(os.path.join(OUT, 'panel.png'))
    for name, colors in PLATES.items():
        plate(colors).save(os.path.join(OUT, f'{name}.png'))
    bricks(src).save(os.path.join(OUT, 'bricks.png'))
    print('ui assets written to', OUT)


if __name__ == '__main__':
    main(sys.argv[1])
