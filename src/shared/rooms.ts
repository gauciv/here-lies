// Every day is a different room: its shape (which stones are solid rock) and its
// name come from the day number, so everyone walks the same room. The rules never
// change; the floor plan does.
import { COLS, ROWS, START, idx } from './grid';

export type RoomPlan = {
  /** walls[idx(c, r)] === true where the floor is solid rock you can't step on */
  walls: boolean[];
  name: string;
  /** a subtle line about the room's shape, never its pits or door */
  tip: string;
};

type Shape = { noun: readonly string[]; tip: string; cells: (mirror: boolean, rand: () => number) => [number, number][] };

const mirrorCells = (cells: [number, number][], mirror: boolean): [number, number][] =>
  mirror ? cells.map(([c, r]) => [COLS - 1 - c, r]) : cells;

const SHAPES: readonly Shape[] = [
  // the plain room
  { noun: ['Hall', 'Crypt', 'Vault'], tip: 'Open floor.', cells: () => [] },
  // five stones wide, solid rock down both sides
  {
    noun: ['Gallery', 'Passage'],
    tip: 'A narrow way.',
    cells: () => {
      const out: [number, number][] = [];
      for (let r = 0; r < ROWS - 2; r++) out.push([0, r], [COLS - 1, r]);
      return out;
    },
  },
  // four pillars hold up the ceiling
  {
    noun: ['Colonnade', 'Cloister'],
    tip: 'Pillars ahead.',
    cells: (_m, rand) => (rand() < 0.5 ? [[1, 2], [5, 2], [1, 5], [5, 5]] : [[2, 2], [4, 2], [2, 5], [4, 5]]),
  },
  // the walls pinch in at the middle
  { noun: ['Narrows', 'Throat'], tip: 'Walls close in.', cells: () => [[0, 3], [0, 4], [0, 5], [1, 4], [6, 3], [6, 4], [6, 5], [5, 4]] },
  // a wall down the middle: left or right?
  { noun: ['Chapel', 'Divide'], tip: 'Left or right?', cells: () => [[3, 3], [3, 4], [3, 5]] },
  // a corner caved in
  { noun: ['Ossuary', 'Cellar'], tip: 'Caved-in corner.', cells: (m) => mirrorCells([[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]], m) },
  // rubble from a collapse, heaped against the sides
  {
    noun: ['Ruin', 'Collapse'],
    tip: 'Mind the rubble.',
    cells: (m, rand) => {
      const left = 1 + Math.floor(rand() * 3);
      const right = 4 + Math.floor(rand() * 2);
      return mirrorCells([[0, left], [0, left + 1], [1, left + 1], [6, right], [5, right], [6, right - 1]], m);
    },
  },
];

const ADJECTIVES = [
  'Drowned', 'Silent', 'Weeping', 'Hollow', 'Ashen', 'Sunken', 'Bleak', 'Forgotten', 'Crooked', 'Starless',
  'Mouldering', 'Whispering', 'Cinder', 'Frozen', 'Hungry', 'Shrouded', 'Bitter', 'Gilded', 'Wailing', 'Bone',
];

/** Stones that must stay open: the stairs and every stone around them. */
const keepOpen = (c: number, r: number): boolean =>
  Math.abs(c - START.c) <= 1 && Math.abs(r - START.r) <= 1;

/**
 * Seven shapes, dealt in a fresh order each week, so the same floor plan never
 * comes up twice in one week. Names and details still vary with `rand`.
 */
export const roomPlan = (day: number, rand: () => number): RoomPlan => {
  const week = Math.floor((day - 1) / 7);
  const order = SHAPES.map((_, i) => i);
  let h = (week * 2654435761) >>> 0;
  for (let k = order.length - 1; k > 0; k--) {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    const j = h % (k + 1);
    [order[k], order[j]] = [order[j]!, order[k]!];
  }
  const shape = SHAPES[order[(day - 1) % order.length] ?? 0] ?? SHAPES[0]!;
  const mirror = rand() < 0.5;
  const walls = new Array<boolean>(COLS * ROWS).fill(false);
  for (const [c, r] of shape.cells(mirror, rand)) if (!keepOpen(c, r)) walls[idx(c, r)] = true;
  const noun = shape.noun[Math.floor(rand() * shape.noun.length)] ?? shape.noun[0]!;
  const adjective = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)] ?? ADJECTIVES[0]!;
  return { walls, name: `The ${adjective} ${noun}`, tip: shape.tip };
};
