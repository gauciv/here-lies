// Last words are an arrow carved into the slab where you last stood: "I stepped
// this way and fell". It can be the truth or a lie. No free text means nothing
// to moderate, and an arrow reads at a glance in torchlight.
import { cellOf, idx, inBounds, isOpen, type Board, type Cell } from './grid';

/** 0 up, then clockwise: 1 up-right, 2 right, 3 down-right, 4 down, 5 down-left, 6 left, 7 up-left */
export type Direction = number;

export const DIRECTIONS: readonly { dc: number; dr: number; name: string }[] = [
  { dc: 0, dr: -1, name: 'up' },
  { dc: 1, dr: -1, name: 'up and right' },
  { dc: 1, dr: 0, name: 'right' },
  { dc: 1, dr: 1, name: 'down and right' },
  { dc: 0, dr: 1, name: 'down' },
  { dc: -1, dr: 1, name: 'down and left' },
  { dc: -1, dr: 0, name: 'left' },
  { dc: -1, dr: -1, name: 'up and left' },
];

export const isDirection = (v: unknown): v is Direction =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < DIRECTIONS.length;

export const directionName = (d: Direction): string => DIRECTIONS[d]?.name ?? 'somewhere';

/** The neighbouring cell an arrow points at (may be off the board). */
export const pointedCell = (from: Cell, d: Direction): Cell => {
  const v = DIRECTIONS[d] ?? DIRECTIONS[0]!;
  return { c: from.c + v.dc, r: from.r + v.dr };
};

/** Directions from a stone that point at another open stone (not off the board, not into rock). */
export const validDirections = (board: Board, from: Cell): Direction[] =>
  DIRECTIONS.map((_, d) => d).filter((d) => {
    const p = pointedCell(from, d);
    return isOpen(board, p.c, p.r);
  });

/** Direction from one cell to an adjacent one, or null if not adjacent. */
export const directionBetween = (from: Cell, to: Cell): Direction | null => {
  const d = DIRECTIONS.findIndex((v) => from.c + v.dc === to.c && from.r + v.dr === to.r);
  return d >= 0 ? d : null;
};

/** An arrow tells the truth when the stone it points at is a pit. */
export const arrowIsTrue = (board: Board, stone: number, arrow: Direction): boolean => {
  const p = pointedCell(cellOf(stone), arrow);
  return inBounds(p.c, p.r) && board.pits[idx(p.c, p.r)] === true;
};

/** A slab crumbles once this many walkers (not its author) have stood on it. */
export const CRUMBLE_AFTER = 5;
/** Safety ceiling on arrows shown at once; the oldest crumbles past it. */
export const MAX_ARROWS = 6;

/** Author id of the dungeon's nameless dead, seeded so no day starts empty. */
export const FORGOTTEN = '~forgotten';
export const isForgotten = (user: string): boolean => user === FORGOTTEN;

/** Placeholder for logged-out viewers. '~' can't appear in a Reddit username. */
export const ANONYMOUS = '~anonymous';
export const isAnonymous = (user: string): boolean => !user || user.startsWith('~');
