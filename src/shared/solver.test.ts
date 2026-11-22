import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, START, difficultyOf, generateBoard, idx, type Board } from './board.ts';
import { solve } from './solver.ts';

const boardWith = (pitCells: [number, number][]): Board => {
  const pits = new Array<boolean>(COLS * ROWS).fill(false);
  for (const [c, r] of pitCells) pits[idx(c, r)] = true;
  return { day: 0, cols: COLS, rows: ROWS, pits, start: START };
};

void test('an empty board is crossed on pure zeros', () => {
  const r = solve(boardWith([]));
  assert.equal(r.solved, true);
  assert.equal(r.comparisons, 0);
});

void test('a wall of pits with no safe gap cannot be crossed', () => {
  const wall: [number, number][] = Array.from({ length: COLS }, (_, c) => [c, 4]);
  assert.equal(solve(boardWith(wall)).solved, false);
});

void test('a coin-flip between two stones is rejected (no guessing allowed)', () => {
  // row 4 is a wall except one gap; the gap's position is ambiguous from below
  const pits: [number, number][] = [[0, 4], [1, 4], [2, 4], [4, 4], [5, 4], [6, 4], [3, 3], [2, 3]];
  const r = solve(boardWith(pits));
  assert.equal(r.solved, false);
});

void test('every daily board for a year is solvable on logic alone, at its difficulty', () => {
  for (let day = 1; day <= 365; day++) {
    const r = solve(generateBoard(day));
    const diff = difficultyOf(day);
    assert.ok(r.solved, `day ${day} needs a guess`);
    assert.ok(r.comparisons >= diff.comparisons[0], `day ${day} too easy for ${diff.name}`);
  }
});

void test('difficulty climbs through the week', () => {
  const mondays = [], sundays = [];
  for (let day = 1; day <= 140; day++) {
    const name = difficultyOf(day).name;
    const r = solve(generateBoard(day));
    if (name === 'Gentle') mondays.push(r.comparisons);
    if (name === 'Brutal') sundays.push(r.comparisons);
  }
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(avg(sundays) > avg(mondays) + 2);
});
