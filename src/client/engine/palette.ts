// The whole game is drawn from this palette. Lighting computes freely in RGB and
// every pixel is then snapped back to the nearest entry, which is what keeps the
// look cohesive and "hand-pixelled" instead of a smooth gradient.

export const C = {
  ink: '#222222', // outline colour shared with the 0x72 tileset
  // tileset stone ramp (0x72 DungeonTileset II)
  pst1: '#483b3a',
  pst2: '#775c55',
  pst3: '#aa8d7a',
  pst4: '#d3bfa9',
  void0: '#06070b',
  void1: '#0c0f16',
  void2: '#141922',
  stone3: '#1c2430',
  stone4: '#27313e',
  stone5: '#354150',
  stone6: '#475567',
  stone7: '#5f6f82',
  stone8: '#8090a2',
  moss1: '#1d3127',
  moss2: '#2d4a32',
  moss3: '#4a6b3d',
  moss4: '#728f4c',
  warm0: '#2e1b14',
  warm1: '#4f2c1c',
  warm2: '#7c4223',
  warm3: '#b06a2e',
  warm4: '#e19a43',
  warm5: '#ffd27a',
  warm6: '#fff1c2',
  // stone under torchlight
  lit1: '#3a3731',
  lit2: '#564e3e',
  lit3: '#786a4f',
  lit4: '#a08a62',
  lit5: '#c9b184',
  bone1: '#a8997c',
  bone2: '#d6c8a6',
  bone3: '#f1e6cb',
  red0: '#5a1e22',
  red1: '#963530',
  red2: '#d4553f',
  ghost1: '#2f5872',
  ghost2: '#5f95b3',
  ghost3: '#a8d4e6',
} as const;

export type ColorKey = keyof typeof C;

type Rgb = readonly [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbMemo = new Map<ColorKey, Rgb>();
export const rgb = (key: ColorKey): Rgb => {
  let v = rgbMemo.get(key);
  if (!v) { v = hexToRgb(C[key]); rgbMemo.set(key, v); }
  return v;
};

const ENTRIES: Rgb[] = Object.values(C).map(hexToRgb);

// 15-bit colour → palette index cache (255 = not computed yet)
const cache = new Uint8Array(32768).fill(255);

/** Nearest palette colour (perceptually weighted). */
export const snap = (r: number, g: number, b: number): Rgb => {
  const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  let i = cache[key]!;
  if (i === 255) {
    let best = 0;
    let bestD = Infinity;
    for (let p = 0; p < ENTRIES.length; p++) {
      const e = ENTRIES[p]!;
      const dr = r - e[0], dg = g - e[1], db = b - e[2];
      const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
      if (d < bestD) { bestD = d; best = p; }
    }
    cache[key] = best;
    i = best;
  }
  return ENTRIES[i]!;
};
