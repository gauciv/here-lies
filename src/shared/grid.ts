// Grid geometry shared by the board generator, the solver and the renderer.

export const COLS = 7;
export const ROWS = 9;

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
