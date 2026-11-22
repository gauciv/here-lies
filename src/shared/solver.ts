// A careful-human solver. It walks only onto stones it can PROVE are safe, using
// the two kinds of reasoning players actually do:
//   1. single number: "this 2 already touches 2 known pits → its other neighbours are safe"
//                     "this 3 has exactly 3 unknown neighbours → they are all pits"
//   2. two numbers:   "this 1's unknowns are a subset of that 2's unknowns → the
//                      leftover stones of the 2 hold exactly 1 pit"
// Graves are never used: every daily board must be crossable on logic alone.
import { cellOf, clue, idx, neighbors, type Board } from './grid';

export type SolveResult = {
  solved: boolean;
  /** how many times a two-number comparison was needed to make progress */
  comparisons: number;
  /** stones the solver had to stand on */
  visited: number;
};

type Constraint = { cells: number[]; pits: number };

const isSubset = (a: number[], b: Set<number>): boolean => a.every((x) => b.has(x));

export const solve = (board: Board): SolveResult => {
  const start = idx(board.start.c, board.start.r);
  const visited = new Set<number>([start]);
  const safe = new Set<number>([start]);
  const pit = new Set<number>();
  let comparisons = 0;

  const unknownNeighbours = (i: number): number[] => {
    const { c, r } = cellOf(i);
    return neighbors(c, r).map((n) => idx(n.c, n.r)).filter((n) => !safe.has(n) && !pit.has(n));
  };

  for (let guard = 0; guard < 400; guard++) {
    // walk onto every proven-safe stone touching where we've been
    let walked = true;
    while (walked) {
      walked = false;
      for (const s of safe) {
        if (visited.has(s)) continue;
        const { c, r } = cellOf(s);
        if (neighbors(c, r).some((n) => visited.has(idx(n.c, n.r)))) {
          visited.add(s);
          walked = true;
        }
      }
    }
    if (visited.has(idx(board.door.c, board.door.r))) return { solved: true, comparisons, visited: visited.size };

    const constraints: Constraint[] = [];
    for (const v of visited) {
      const cells = unknownNeighbours(v);
      if (!cells.length) continue;
      const { c, r } = cellOf(v);
      const knownPits = neighbors(c, r).filter((n) => pit.has(idx(n.c, n.r))).length;
      constraints.push({ cells, pits: clue(board, c, r) - knownPits });
    }

    const apply = (k: Constraint): boolean => {
      if (k.pits === 0) { k.cells.forEach((x) => safe.add(x)); return k.cells.length > 0; }
      if (k.pits === k.cells.length) { k.cells.forEach((x) => pit.add(x)); return k.cells.length > 0; }
      return false;
    };

    let progress = false;
    for (const k of constraints) progress = apply(k) || progress;
    if (progress) continue;

    // two-number comparisons
    outer: for (const a of constraints) {
      for (const b of constraints) {
        if (a === b || a.cells.length >= b.cells.length) continue;
        const bSet = new Set(b.cells);
        if (!isSubset(a.cells, bSet)) continue;
        const aSet = new Set(a.cells);
        const rest = b.cells.filter((x) => !aSet.has(x));
        if (apply({ cells: rest, pits: b.pits - a.pits })) {
          comparisons++;
          progress = true;
          break outer;
        }
      }
    }
    if (!progress) return { solved: false, comparisons, visited: visited.size };
  }
  return { solved: false, comparisons, visited: visited.size };
};

