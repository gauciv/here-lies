// Hand-authored pixel sprites. Each character maps to a palette key; '.' is empty.
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

// ── wanderer: hooded figure, lantern carried at its right hand ──────────────
const WANDERER_ROWS = [
  '..aaa..',
  '.abbba.',
  '.bcccb.',
  '.abcba.',
  'aabbbaa',
  'abbbbba',
  'abbbbbd',
  'abbbbba',
  '.abbba.',
  '.e...e.',
] as const;
const WANDERER_LEGEND: Legend = { a: 'red0', b: 'red1', c: 'void0', d: 'bone1', e: 'void1' };

// ── grave stone ─────────────────────────────────────────────────────────────
const STONE_ROWS = [
  '..ooooo..',
  '.oSSSSSo.',
  'oSSSkSSSo',
  'oSSkkkSSo',
  'oSSSkSSSo',
  'oSSSkSSSo',
  'oSSSSSSSo',
  'oSSSSSSSo',
  'oSSSSSSSo',
  'goooooooo',
  '.ggggggg.',
] as const;
const STONE_LEGEND: Legend = { o: 'stone4', S: 'stone7', k: 'stone3', g: 'void1' };
const STONE_MINE_LEGEND: Legend = { o: 'stone5', S: 'bone2', k: 'stone4', g: 'void1' };

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
  wanderer: Sprite;
  stone: Sprite;
  stoneMine: Sprite;
  digit: (n: number, color: ColorKey) => Sprite;
};

let sprites: Sprites | null = null;

export const getSprites = (): Sprites => {
  if (sprites) return sprites;
  const digitCache = new Map<string, Sprite>();
  sprites = {
    wanderer: build(WANDERER_ROWS, WANDERER_LEGEND),
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
