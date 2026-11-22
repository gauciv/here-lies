"""Prepare the other CC0 assets used by the standby room.

- Campfire: Idylwild's Chromatic Campfires (CC0) - 4 orange frames, sliced.
  https://opengameart.org/content/idylwilds-chromatic-campfires
- Parchment: zwonky's Parchment GUI (CC0) - the torn panel, recoloured to aged
  paper tones that sit with the dungeon palette, pre-scaled for border-image.
  https://opengameart.org/content/parchment-gui

Usage: python3 tools/build_extras.py <campfires_PNG.png> <panels.png>
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'client', 'assets')
SCALE = 3

# orange campfire without smoke: frames at x = 11 + 48k, rows 145..182
FIRE_Y0, FIRE_Y1, FIRE_W = 145, 182, 26

PARCHMENT_REMAP = {
    (0xF7, 0xE2, 0x6B): (0xE0, 0xCC, 0xA0),  # paper
    (0x9D, 0x9D, 0x9D): (0xA8, 0x8F, 0x6A),  # torn edge
    (0x49, 0x3C, 0x2B): (0x4A, 0x39, 0x28),  # flecks and outline
}


def main(campfires: str, panels: str) -> None:
    sheet = Image.open(campfires).convert('RGBA')
    frames = [sheet.crop((11 + 48 * k, FIRE_Y0, 11 + 48 * k + FIRE_W, FIRE_Y1)) for k in range(4)]
    strip = Image.new('RGBA', (FIRE_W * 4, FIRE_Y1 - FIRE_Y0))
    for k, f in enumerate(frames):
        strip.alpha_composite(f, (FIRE_W * k, 0))
    strip.save(os.path.join(OUT, 'campfire.png'), optimize=True)

    panel = Image.open(panels).convert('RGBA').crop((48, 0, 96, 48))
    px = panel.load()
    for x in range(panel.width):
        for y in range(panel.height):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in PARCHMENT_REMAP:
                px[x, y] = (*PARCHMENT_REMAP[(r, g, b)], a)
    panel.resize((panel.width * SCALE, panel.height * SCALE), Image.NEAREST).save(
        os.path.join(OUT, 'ui', 'parchment.png'), optimize=True)
    print('campfire', strip.size, '+ parchment written')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
