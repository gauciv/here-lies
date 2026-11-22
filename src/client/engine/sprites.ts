// Hand-authored pixel sprites (only what the CC0 tileset doesn't provide).
// Each character maps to a palette key; '.' is empty.
import { C, type ColorKey } from './palette';

export type Sprite = { w: number; h: number; canvas: HTMLCanvasElement };

type Legend = Record<string, ColorKey>;

const build = (rows: readonly string[], legend: Legend): Sprite => {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const key = legend[ch];
      if (!key) return;
      ctx.fillStyle = C[key];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  return { w, h, canvas };
};

// ── grave stone, outlined to sit with the tileset's chunky style ────────────
const STONE_ROWS = [
  '...oooo...',
  '..oSSSSo..',
  '.oSSSSSSo.',
  '.oSSSkSSo.',
  '.oSSkkkSo.',
  '.oSSSkSSo.',
  '.oSSSkSSo.',
  '.oSSSSSSo.',
  '.oSSSSShho',
  '.ohhhhhhho',
  'oooooooooo',
] as const;
const STONE_LEGEND: Legend = { o: 'ink', S: 'stone8', h: 'stone6', k: 'stone5' };
const STONE_MINE_LEGEND: Legend = { o: 'ink', S: 'bone2', h: 'bone1', k: 'lit3' };

// ── 3x5 digits ──────────────────────────────────────────────────────────────
const DIGITS: Record<number, readonly string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '.#.', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
};

export type Sprites = {
  stone: Sprite;
  stoneMine: Sprite;
  digit: (n: number, color: ColorKey) => Sprite;
};

let sprites: Sprites | null = null;

export const getSprites = (): Sprites => {
  if (sprites) return sprites;
  const digitCache = new Map<string, Sprite>();
  sprites = {
    stone: build(STONE_ROWS, STONE_LEGEND),
    stoneMine: build(STONE_ROWS, STONE_MINE_LEGEND),
    digit: (n, color) => {
      const k = `${n}:${color}`;
      let s = digitCache.get(k);
      if (!s) {
        s = build(DIGITS[n] ?? DIGITS[8]!, { '#': color });
        digitCache.set(k, s);
      }
      return s;
    },
  };
  return sprites;
};
