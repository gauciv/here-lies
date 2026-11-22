import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS,
  ROWS,
  START,
  clue,
  difficultyOf,
  generateBoard,
  idx,
  judgeRun,
  neighbors,
  shortestCrossing,
  type Cell,
} from './board.ts';

void test('boards are deterministic per day', () => {
  assert.deepEqual(generateBoard(12).pits, generateBoard(12).pits);
  assert.notDeepEqual(generateBoard(12).pits, generateBoard(13).pits);
});

void test('every board for a year is winnable with a safe start', () => {
  for (let day = 1; day <= 365; day++) {
    const b = generateBoard(day);
    assert.equal(b.pits.length, COLS * ROWS);
    assert.ok(shortestCrossing(b.pits) > 0, `day ${day} unwinnable`);
    assert.equal(b.pits[idx(START.c, START.r)], false);
    for (const n of neighbors(START.c, START.r)) assert.equal(b.pits[idx(n.c, n.r)], false);
    const count = b.pits.filter(Boolean).length;
    const diff = difficultyOf(day);
    assert.ok(count >= diff.pits[0] && count <= diff.pits[1], `day ${day} has ${count} pits`);
  }
});

void test('clue counts touching pits', () => {
  const b = generateBoard(5);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const expected = neighbors(c, r).filter((n) => b.pits[idx(n.c, n.r)]).length;
      assert.equal(clue(b, c, r), expected);
    }
});

const safePath = (day: number): Cell[] => {
  const b = generateBoard(day);
  // BFS with parents to recover a crossing
  const prev = new Map<number, number>();
  const q = [idx(START.c, START.r)];
  const seen = new Set(q);
  let end = -1;
  for (let h = 0; h < q.length && end < 0; h++) {
    const cur = q[h]!;
    const c = cur % COLS, r = Math.floor(cur / COLS);
    for (const n of neighbors(c, r)) {
      const ni = idx(n.c, n.r);
      if (seen.has(ni) || b.pits[ni]) continue;
      seen.add(ni); prev.set(ni, cur); q.push(ni);
      if (n.r === 0) { end = ni; break; }
    }
  }
  const path: Cell[] = [];
  for (let at = end; at !== idx(START.c, START.r); at = prev.get(at)!) path.unshift({ c: at % COLS, r: Math.floor(at / COLS) });
  return path;
};

void test('judgeRun accepts a real crossing and a fall, rejects cheats', () => {
  const day = 7, b = generateBoard(day);
  const path = safePath(day);
  assert.equal(judgeRun(b, path).kind, 'crossed');

  const pitIdx = b.pits.findIndex((p, i) => p && neighbors(i % COLS, Math.floor(i / COLS)).some((n) => !b.pits[idx(n.c, n.r)]));
  assert.ok(pitIdx >= 0);
  assert.equal(judgeRun(b, [{ c: 0, r: 0 }]).kind, 'invalid'); // teleport
  assert.equal(judgeRun(b, [...path, { c: path.at(-1)!.c, r: 1 }]).kind, 'invalid'); // walk after crossing
  assert.equal(judgeRun(b, []).kind, 'invalid');
});
