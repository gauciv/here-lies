// Daily board: deterministic from the day number so every player (and the server)
// sees the same crossing. Pure functions only — imported by client and server.

export const COLS = 7;
export const ROWS = 9;
export const CANDLES_PER_DAY = 3;

export type Cell = { c: number; r: number };

export type Board = {
  day: number;
  cols: number;
  rows: number;
  /** pits[idx(c, r)] === true when the stone at (c, r) hides a pit */
  pits: boolean[];
  start: Cell;
};

export const START: Cell = { c: 3, r: ROWS - 1 };

/** Day 1 of Here Lies (UTC). */
const LAUNCH_UTC = Date.UTC(2026, 10, 21);
const DAY_MS = 86_400_000;

export const dayNumber = (now: number = Date.now()): number =>
  Math.floor((now - LAUNCH_UTC) / DAY_MS) + 1;

export const dayStartUtc = (day: number): number => LAUNCH_UTC + (day - 1) * DAY_MS;

export const idx = (c: number, r: number): number => r * COLS + c;
export const cellOf = (i: number): Cell => ({ c: i % COLS, r: Math.floor(i / COLS) });
export const inBounds = (c: number, r: number): boolean =>
  c >= 0 && r >= 0 && c < COLS && r < ROWS;

export const isStep = (a: Cell, b: Cell): boolean =>
  Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r)) === 1;

export const neighbors = (c: number, r: number): Cell[] => {
  const out: Cell[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++)
      if ((dc || dr) && inBounds(c + dc, r + dr)) out.push({ c: c + dc, r: r + dr });
  return out;
};

/** Number of pits touching a stone (8-neighbourhood). */
export const clue = (board: Board, c: number, r: number): number =>
  neighbors(c, r).reduce((n, p) => n + (board.pits[idx(p.c, p.r)] ? 1 : 0), 0);

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

export const generateBoard = (day: number): Board => {
  for (let attempt = 0; attempt < 500; attempt++) {
    const rand = mulberry32(hashInts(0x4e1e, day, attempt));
    const pits = new Array<boolean>(COLS * ROWS).fill(false);
    const safe = new Set<number>([idx(START.c, START.r)]);
    for (const n of neighbors(START.c, START.r)) safe.add(idx(n.c, n.r));

    const target = 11 + Math.floor(rand() * 4); // 11–14 pits
    let placed = 0;
    while (placed < target) {
      const i = Math.floor(rand() * COLS * ROWS);
      if (safe.has(i) || pits[i]) continue;
      pits[i] = true;
      placed++;
    }

    // Reject boards that are unwinnable, or trivially straight.
    const len = shortestCrossing(pits);
    if (len < 0) continue;
    const straightOpen = Array.from({ length: ROWS }, (_, r) => !pits[idx(START.c, r)]).every(Boolean);
    if (straightOpen) continue;
    const farRowSafe = Array.from({ length: COLS }, (_, c) => !pits[idx(c, 0)]).filter(Boolean).length;
    if (farRowSafe > 5) continue;

    return { day, cols: COLS, rows: ROWS, pits, start: START };
  }
  throw new Error(`could not generate board for day ${day}`);
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
