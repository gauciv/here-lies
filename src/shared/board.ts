// Daily board: deterministic from the day number so every player (and the server)
// sees the same crossing. Pure functions only — imported by client and server.

export * from './grid';
import { COLS, ROWS, START, idx, cellOf, neighbors, isStep, inBounds, type Board, type Cell } from './grid';
import { solve } from './solver';

export const CANDLES_PER_DAY = 3;

/** Day 1 of Here Lies (UTC). */
const LAUNCH_UTC = Date.UTC(2026, 10, 21);
const DAY_MS = 86_400_000;

export const dayNumber = (now: number = Date.now()): number =>
  Math.floor((now - LAUNCH_UTC) / DAY_MS) + 1;

export const dayStartUtc = (day: number): number => LAUNCH_UTC + (day - 1) * DAY_MS;

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashInts = (...xs: number[]): number => {
  let h = 2166136261;
  for (const x of xs) {
    h ^= x;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  return h >>> 0;
};

/** Shortest 8-connected safe path length from start to the far row, or -1. */
export const shortestCrossing = (pits: boolean[], start: Cell = START): number => {
  const dist = new Array<number>(COLS * ROWS).fill(-1);
  const q: number[] = [idx(start.c, start.r)];
  dist[q[0]!] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]!;
    const { c, r } = cellOf(cur);
    if (r === 0) return dist[cur]!;
    for (const n of neighbors(c, r)) {
      const ni = idx(n.c, n.r);
      if (dist[ni] === -1 && !pits[ni]) {
        dist[ni] = dist[cur]! + 1;
        q.push(ni);
      }
    }
  }
  return -1;
};

export type Difficulty = {
  name: string;
  /** pits placed: [min, max] */
  pits: readonly [number, number];
  /** two-number comparisons a careful player must make: [min, max] */
  comparisons: readonly [number, number];
};

// Difficulty climbs through the week (UTC), crossword-style. Every board is
// guaranteed crossable on logic alone; harder days need more cross-checking.
const WEEK: readonly Difficulty[] = [
  { name: 'Brutal', pits: [15, 16], comparisons: [4, 9] }, // Sunday
  { name: 'Gentle', pits: [11, 12], comparisons: [1, 2] }, // Monday
  { name: 'Gentle', pits: [11, 12], comparisons: [1, 2] },
  { name: 'Tricky', pits: [12, 13], comparisons: [2, 3] },
  { name: 'Tricky', pits: [13, 14], comparisons: [2, 4] },
  { name: 'Cruel', pits: [14, 15], comparisons: [3, 5] },
  { name: 'Cruel', pits: [14, 15], comparisons: [3, 6] }, // Saturday
];

export const difficultyOf = (day: number): Difficulty => WEEK[new Date(dayStartUtc(day)).getUTCDay()] ?? WEEK[1]!;

const placePits = (rand: () => number, count: number): boolean[] => {
  const pits = new Array<boolean>(COLS * ROWS).fill(false);
  const safe = new Set<number>([idx(START.c, START.r)]);
  for (const n of neighbors(START.c, START.r)) safe.add(idx(n.c, n.r));
  let placed = 0;
  while (placed < count) {
    const i = Math.floor(rand() * COLS * ROWS);
    if (safe.has(i) || pits[i]) continue;
    pits[i] = true;
    placed++;
  }
  return pits;
};

const boardCache = new Map<number, Board>();

/**
 * The day's crossing. Deterministic per day, and always solvable without guessing:
 * a careful-human solver must reach the far wall using only the numbers, with the
 * amount of cross-checking set by the day's difficulty.
 */
export const generateBoard = (day: number): Board => {
  const cached = boardCache.get(day);
  if (cached) return cached;
  const diff = difficultyOf(day);
  let fallback: Board | null = null;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const rand = mulberry32(hashInts(0x4e1e, day, attempt));
    const count = diff.pits[0] + Math.floor(rand() * (diff.pits[1] - diff.pits[0] + 1));
    const board: Board = { day, cols: COLS, rows: ROWS, pits: placePits(rand, count), start: START };
    const result = solve(board);
    if (!result.solved) continue;
    if (result.comparisons >= diff.comparisons[0] && result.comparisons <= diff.comparisons[1]) {
      boardCache.set(day, board);
      return board;
    }
    if (!fallback || result.comparisons >= 1) fallback = board;
  }
  // Practically unreachable; still guarantee a solvable board rather than failing.
  if (!fallback) throw new Error(`could not generate board for day ${day}`);
  boardCache.set(day, fallback);
  return fallback;
};

export type RunOutcome =
  | { kind: 'crossed'; steps: number }
  | { kind: 'fell'; steps: number; at: Cell }
  | { kind: 'invalid'; reason: string };

/**
 * Server-side check of a walked path (start excluded). A valid run is a chain of
 * single steps over safe stones that either reaches row 0 or ends in exactly one pit.
 */
export const judgeRun = (board: Board, path: Cell[]): RunOutcome => {
  if (path.length === 0 || path.length > 200) return { kind: 'invalid', reason: 'bad length' };
  let prev = board.start;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (!Number.isInteger(p.c) || !Number.isInteger(p.r) || !inBounds(p.c, p.r))
      return { kind: 'invalid', reason: 'out of bounds' };
    if (!isStep(prev, p)) return { kind: 'invalid', reason: 'not a step' };
    const last = i === path.length - 1;
    if (board.pits[idx(p.c, p.r)]) {
      return last ? { kind: 'fell', steps: i + 1, at: p } : { kind: 'invalid', reason: 'walked through a pit' };
    }
    if (p.r === 0) {
      return last ? { kind: 'crossed', steps: i + 1 } : { kind: 'invalid', reason: 'kept walking after crossing' };
    }
    prev = p;
  }
  return { kind: 'invalid', reason: 'run did not end' };
};
