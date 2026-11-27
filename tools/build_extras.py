"""Prepare the campfire used by the camp: Idylwild's Chromatic Campfires (CC0),
4 orange frames, sliced into a strip.
https://opengameart.org/content/idylwilds-chromatic-campfires

Usage: python3 tools/build_extras.py <campfires_PNG.png>
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'client', 'assets')

# orange campfire without smoke: frames at x = 11 + 48k, rows 145..182
FIRE_Y0, FIRE_Y1, FIRE_W = 145, 182, 26


def main(campfires: str) -> None:
    sheet = Image.open(campfires).convert('RGBA')
    frames = [sheet.crop((11 + 48 * k, FIRE_Y0, 11 + 48 * k + FIRE_W, FIRE_Y1)) for k in range(4)]
    strip = Image.new('RGBA', (FIRE_W * 4, FIRE_Y1 - FIRE_Y0))
    for k, f in enumerate(frames):
        strip.alpha_composite(f, (FIRE_W * k, 0))
    strip.save(os.path.join(OUT, 'campfire.png'), optimize=True)
    print('campfire', strip.size, 'written')


if __name__ == '__main__':
    main(sys.argv[1])
