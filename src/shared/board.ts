// Daily board: deterministic from the day number so every player (and the server)
// sees the same crossing. Pure functions only — imported by client and server.

export * from './grid';
import { COLS, ROWS, START, idx, cellOf, neighbors, isStep, isOpen, type Board, type Cell } from './grid';
import { roomPlan } from './rooms';
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

/** Shortest 8-connected safe path length from the stairs to the door, or -1. */
export const shortestCrossing = (board: Board): number => {
  const dist = new Array<number>(COLS * ROWS).fill(-1);
  const q: number[] = [idx(board.start.c, board.start.r)];
  dist[q[0]!] = 0;
  const door = idx(board.door.c, board.door.r);
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]!;
    if (cur === door) return dist[cur]!;
    const { c, r } = cellOf(cur);
    for (const n of neighbors(c, r)) {
      const ni = idx(n.c, n.r);
      if (dist[ni] === -1 && !board.pits[ni] && isOpen(board, n.c, n.r)) {
        dist[ni] = dist[cur]! + 1;
        q.push(ni);
      }
    }
  }
  return -1;
};

export type Difficulty = {
  name: string;
  /** pits placed in a full 7×9 room: [min, max]; smaller rooms get proportionally fewer */
  pits: readonly [number, number];
  /** two-number comparisons a careful player must make: [min, max] */
  comparisons: readonly [number, number];
  /** chance that each of the morning's forgotten slabs tells the truth */
  honesty: number;
  /** one line on the parchment so the day's mood reads before you step in */
  hint: string;
};

const GENTLE: Difficulty = { name: 'Gentle', pits: [11, 12], comparisons: [1, 2], honesty: 0.8, hint: 'The dead here mostly tell the truth.' };
const TRICKY: Difficulty = { name: 'Tricky', pits: [12, 14], comparisons: [2, 3], honesty: 0.6, hint: 'Some of the dead here lie.' };
const CRUEL: Difficulty = { name: 'Cruel', pits: [14, 15], comparisons: [3, 5], honesty: 0.4, hint: 'Trust no slab. Trust the numbers.' };

// A gentle weekly rhythm (UTC): easy at the start of the week, hardest on
// Friday and Saturday, easing off on Sunday. Every board is crossable on logic
// alone; harder days need more cross-checking and the dead lie more.
const WEEK: readonly Difficulty[] = [TRICKY, GENTLE, GENTLE, TRICKY, TRICKY, CRUEL, CRUEL]; // Sunday first

export const difficultyOf = (day: number): Difficulty => WEEK[new Date(dayStartUtc(day)).getUTCDay()] ?? GENTLE;

/** How many pits a room of this many open stones gets, scaled from the full-room range. */
export const pitRange = (diff: Difficulty, walls: boolean[]): [number, number] => {
  const open = walls.filter((w) => !w).length;
  const k = open / (COLS * ROWS);
  return [Math.round(diff.pits[0] * k), Math.round(diff.pits[1] * k)];
};

const placePits = (rand: () => number, count: number, door: Cell, walls: boolean[]): boolean[] => {
  const pits = new Array<boolean>(COLS * ROWS).fill(false);
  const safe = new Set<number>([idx(START.c, START.r), idx(door.c, door.r)]);
  for (const n of neighbors(START.c, START.r)) safe.add(idx(n.c, n.r));
  let placed = 0;
  while (placed < count) {
    const i = Math.floor(rand() * COLS * ROWS);
    if (safe.has(i) || pits[i] || walls[i]) continue;
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
  // the room's shape and name are fixed for the day; only the pits are searched
  const { walls, name } = roomPlan(day, mulberry32(hashInts(0x0b0e, day)));
  const [lo, hi] = pitRange(diff, walls);
  const doors = Array.from({ length: COLS }, (_, c) => c).filter((c) => !walls[idx(c, 0)]);
  let fallback: Board | null = null;
  for (let attempt = 0; attempt < 6000; attempt++) {
    const rand = mulberry32(hashInts(0x4e1e, day, attempt));
    const count = lo + Math.floor(rand() * (hi - lo + 1));
    // the door moves along the far wall from day to day
    const door: Cell = { c: doors[Math.floor(rand() * doors.length)] ?? START.c, r: 0 };
    const board: Board = { day, cols: COLS, rows: ROWS, pits: placePits(rand, count, door, walls), walls, name, start: START, door };
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
 * single steps over open, safe stones that either reaches the door or ends in exactly one pit.
 */
export const judgeRun = (board: Board, path: Cell[]): RunOutcome => {
  if (path.length === 0 || path.length > 200) return { kind: 'invalid', reason: 'bad length' };
  let prev = board.start;
  for (let i = 0; i < path.length; i++) {
    const p = path[i]!;
    if (!Number.isInteger(p.c) || !Number.isInteger(p.r) || !isOpen(board, p.c, p.r))
      return { kind: 'invalid', reason: 'out of bounds' };
    if (!isStep(prev, p)) return { kind: 'invalid', reason: 'not a step' };
    const last = i === path.length - 1;
    if (board.pits[idx(p.c, p.r)]) {
      return last ? { kind: 'fell', steps: i + 1, at: p } : { kind: 'invalid', reason: 'walked through a pit' };
    }
    if (p.c === board.door.c && p.r === board.door.r) {
      return last ? { kind: 'crossed', steps: i + 1 } : { kind: 'invalid', reason: 'kept walking after crossing' };
    }
    prev = p;
  }
  return { kind: 'invalid', reason: 'run did not end' };
};
