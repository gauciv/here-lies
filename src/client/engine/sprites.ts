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

// ── grave slab: a flat ledger stone set into the floor ──────────────────────
const SLAB_ROWS = [
  '.oooooooooo.',
  'oHHHHHHHHHHo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oHLLLLLLLLMo',
  'oMMMMMMMMMMo',
  '.oooooooooo.',
] as const;
const SLAB_LEGEND: Legend = { o: 'ink', H: 'pst4', L: 'pst3', M: 'pst2' };
// the same slab as a small corner marker, for stones whose number must stay readable
const SLAB_MINI_ROWS = [
  '.oooooo.',
  'oHHHHHHo',
  'oHLLLLMo',
  'oHLLLLMo',
  'oHLLLLMo',
  'oHLLLLMo',
  'oMMMMMMo',
  '.oooooo.',
] as const;
const SLAB_MINE_LEGEND: Legend = { o: 'ink', H: 'bone3', L: 'bone2', M: 'bone1' };

// ── arrows: drawn for up and up-right, rotated for the other six ────────────
const ARROW_UP = ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'] as const;
const ARROW_UP_RIGHT = ['..#####', '...####', '....###', '...####', '..###.#', '.###...', '###....'] as const;
const ARROW_MINI_UP = ['..#..', '.###.', '#####', '..#..', '..#..'] as const;
const ARROW_MINI_UP_RIGHT = ['.####', '...##', '..#.#', '.#..#', '#....'] as const;

const rotate = (rows: readonly string[]): string[] => {
  const n = rows.length;
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => rows[n - 1 - x]![y]).join(''));
};

/** Arrow rows for a direction: 0 up, clockwise through 7 up-left. */
export const arrowRows = (dir: number, mini = false): string[] => {
  let rows: string[] = [...(dir % 2 === 0 ? (mini ? ARROW_MINI_UP : ARROW_UP) : (mini ? ARROW_MINI_UP_RIGHT : ARROW_UP_RIGHT))];
  for (let k = 0; k < Math.floor(dir / 2); k++) rows = rotate(rows);
  return rows;
};

// ── ghost: the dwarf's spirit (spiky hair, big beard, wisps for legs) ───────
const GHOST_A = [
  '......oo........',
  '.....oHHo.......',
  '....oHHBBo......',
  '...oHBBBBBoo....',
  '..oHBBBBBBBBo...',
  '..oBBBBBBBBBBo..',
  '..oBeeBBBeeBBo..',
  '..oBeeBBBeeBBo..',
  '..oBBBBBBBBBBo..',
  '..oBWWWWWWWWBo..',
  '.oSWWWWWWWWWWSo.',
  '.oSWWWWWWWWWWSo.',
  '.oSBWWWWWWWWBSo.',
  '..oSBWWWWWWBSo..',
  '..oSBBWWWWBBSo..',
  '..oSBBBWWBBBSo..',
  '...oSBBBBBBSo...',
  '...oSBBSSBBSo...',
  '....oSBo.oSBo...',
  '....oSo...oSo...',
  '.....o.....o....',
] as const;
const GHOST_B = [
  ...GHOST_A.slice(0, 17),
  '...oSBBSSBBSo...',
  '...oSBo..oSBo...',
  '...oSo....oSo...',
  '....o......o....',
] as const;
const GHOST_LEGEND: Legend = { o: 'ghost1', H: 'bone3', B: 'ghost3', W: 'bone2', S: 'ghost2', e: 'void1' };

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
  ghost: readonly [Sprite, Sprite];
  slab: Sprite;
  slabMine: Sprite;
  slabMini: Sprite;
  slabMiniMine: Sprite;
  arrow: (dir: number, color: ColorKey) => Sprite;
  arrowMini: (dir: number, color: ColorKey) => Sprite;
  digit: (n: number, color: ColorKey) => Sprite;
};

let sprites: Sprites | null = null;

export const getSprites = (): Sprites => {
  if (sprites) return sprites;
  const cache = new Map<string, Sprite>();
  const cached = (key: string, make: () => Sprite): Sprite => {
    let s = cache.get(key);
    if (!s) { s = make(); cache.set(key, s); }
    return s;
  };
  sprites = {
    ghost: [build(GHOST_A, GHOST_LEGEND), build(GHOST_B, GHOST_LEGEND)],
    slab: build(SLAB_ROWS, SLAB_LEGEND),
    slabMine: build(SLAB_ROWS, SLAB_MINE_LEGEND),
    slabMini: build(SLAB_MINI_ROWS, SLAB_LEGEND),
    slabMiniMine: build(SLAB_MINI_ROWS, SLAB_MINE_LEGEND),
    arrow: (dir, color) => cached(`a${dir}:${color}`, () => build(arrowRows(dir), { '#': color })),
    arrowMini: (dir, color) => cached(`m${dir}:${color}`, () => build(arrowRows(dir, true), { '#': color })),
    digit: (n, color) => cached(`d${n}:${color}`, () => build(DIGITS[n] ?? DIGITS[8]!, { '#': color })),
  };
  return sprites;
};
