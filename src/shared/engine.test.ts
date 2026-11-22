import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, START, cellOf, dayNumber, generateBoard, idx, neighbors, type Cell } from './board.ts';
import { arrowIsTrue, directionBetween, validDirections } from './epitaphs.ts';
import { Engine, GameError } from './engine.ts';
import { MemoryStore } from './memoryStore.ts';

const DAY = dayNumber();
const board = generateBoard(DAY);

/** BFS path from start to target over safe stones (target itself may be a pit). */
const pathTo = (target: (c: Cell) => boolean): Cell[] => {
  const prev = new Map<number, number>();
  const s = idx(START.c, START.r);
  const q = [s];
  const seen = new Set(q);
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]!;
    for (const n of neighbors(cur % COLS, Math.floor(cur / COLS))) {
      const ni = idx(n.c, n.r);
      if (seen.has(ni) || board.walls[ni]) continue;
      seen.add(ni);
      prev.set(ni, cur);
      if (target(n)) {
        const path: Cell[] = [];
        for (let at = ni; at !== s; at = prev.get(at)!) path.unshift({ c: at % COLS, r: Math.floor(at / COLS) });
        return path;
      }
      if (!board.pits[ni]) q.push(ni);
    }
  }
  throw new Error('no path');
};

const pitPath = pathTo((c) => board.pits[idx(c.c, c.r)] === true);
const crossPath = pathTo((c) => c.c === board.door.c && c.r === board.door.r);
const arrowFor = (stone: number): number => validDirections(board, cellOf(stone))[0]!;

void test('fall → carve → cross loop', async () => {
  const e = new Engine(new MemoryStore());
  const fell = await e.fall(DAY, 'alice', pitPath);
  assert.equal(fell.me.candles, 2);
  assert.equal(fell.day.fallen, 1);
  const i = fell.grave.i;
  // the slab sits on the last safe stone, not on the pit
  const lastSafe = pitPath.length >= 2 ? pitPath[pitPath.length - 2]! : START;
  const pit = pitPath[pitPath.length - 1]!;
  assert.equal(i, idx(lastSafe.c, lastSafe.r));
  assert.equal(board.pits[i], false);
  assert.deepEqual(fell.me.fellInto, [idx(pit.c, pit.r)]);
  assert.equal(fell.me.uncarved, i);
  await assert.rejects(e.carve(DAY, 'alice', i, 99), /direction/);

  await assert.rejects(e.cross(DAY, 'alice', crossPath), GameError); // must carve first
  const truth = directionBetween(lastSafe, pit)!;
  const carved = await e.carve(DAY, 'alice', i, truth);
  assert.equal(carved.grave.top?.arrow, truth);
  assert.equal(carved.me.uncarved, null);

  assert.equal(carved.me.myArrow?.truthful, true);

  const crossed = await e.cross(DAY, 'alice', crossPath);
  assert.equal(crossed.me.crossed, true);
  assert.equal(crossed.me.rank, 1);
  assert.equal(crossed.me.streak, 1);
  assert.equal(crossed.me.bestStreak, 1);
  await assert.rejects(e.cross(DAY, 'alice', crossPath), GameError);

  const init = await e.init(DAY, 'bob', 't3_x');
  assert.ok(init.graves.some((g) => g.i === i && g.top?.user === 'alice'));
  assert.equal(init.day.crossed, 1);
});

void test('a fresh day is seeded once with forgotten graves that do not count as fallen', async () => {
  const e = new Engine(new MemoryStore());
  const a = await e.init(DAY, 'zoe', 't3_x');
  const b = await e.init(DAY, 'yan', 't3_x');
  assert.equal(a.graves.length, 3);
  assert.equal(b.graves.length, 3);
  assert.equal(a.day.fallen, 0);
  for (const g of a.graves) {
    assert.equal(g.top?.user, '~forgotten');
    const b = generateBoard(DAY);
    const at = cellOf(g.i);
    assert.equal(b.pits[g.i], false, 'slabs sit on safe stones');
    assert.ok(neighbors(at.c, at.r).some((n) => b.pits[idx(n.c, n.r)]), 'a slab always borders a pit');
  }
});

void test('candles run out after three falls', async () => {
  const e = new Engine(new MemoryStore());
  for (let k = 0; k < 3; k++) {
    const f = await e.fall(DAY, 'carol', pitPath);
    if (f.me.uncarved !== null) await e.carve(DAY, 'carol', f.grave.i, arrowFor(f.grave.i));
  }
  await assert.rejects(e.fall(DAY, 'carol', pitPath), /candles/);
});

void test('concurrent falls cannot overspend candles', async () => {
  const e = new Engine(new MemoryStore());
  const results = await Promise.allSettled([0, 1, 2, 3, 4].map(() => e.fall(DAY, 'erin', pitPath)));
  assert.ok(results.filter((r) => r.status === 'fulfilled').length <= 3);
  const init = await e.init(DAY, 'erin', 't3_x');
  assert.ok(init.me.candles >= 0);
});

void test('sharing: only after the run, once, and a failed post can be retried', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.claimShare(DAY, 'sam'), /Finish/);
  await e.cross(DAY, 'sam', crossPath);
  const text = await e.claimShare(DAY, 'sam');
  assert.match(text, /Crossed the dark/);
  assert.ok(/^[\x20-\x7E\n·]*$/.test(text), 'share text uses only characters every font has');
  await assert.rejects(e.claimShare(DAY, 'sam'), /already/);
  await e.confirmShare(DAY, 'sam', false);
  await e.claimShare(DAY, 'sam');
  const me = await e.confirmShare(DAY, 'sam', true);
  assert.equal(me.shared, true);
  await assert.rejects(e.claimShare(DAY, 'sam'), /already/);
});

void test('pioneer score rewards crossing before others map the pits', async () => {
  const e = new Engine(new MemoryStore());
  await e.init(DAY, 'early', 't3_x'); // seeds forgotten graves, which never count
  await assert.rejects(e.flairFor(DAY, 'early'), /Cross/);
  const first = await e.cross(DAY, 'early', crossPath);
  assert.equal(first.me.pioneer, 100);
  const flair = await e.flairFor(DAY, 'early');
  assert.match(flair.text, /^Trailblazer · /);
  assert.ok(!flair.text.includes(','));
  // someone else falls into an unmarked pit: later crossers score lower
  await e.fall(DAY, 'faller', pitPath);
  const late = await e.cross(DAY, 'late', crossPath);
  assert.ok(late.me.pioneer !== null && late.me.pioneer < 100);
  // your own falls never count against you
  await e.fall(DAY, 'solo', pitPath);
  const solo = await e.cross(DAY, 'solo', crossPath);
  assert.equal(solo.me.pioneer, late.me.pioneer);
});

void test('logged-out placeholders can never act, and real names are never mistaken for them', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.cross(DAY, '~anonymous', crossPath), /Log in/);
  await assert.rejects(e.flairFor(DAY, '~anonymous'), /Log in/);
  await assert.rejects(e.claimShare(DAY, '~anonymous'), /Log in/);
  const real = await e.cross(DAY, 'anonymous', crossPath); // a real Reddit user may be called this
  assert.equal(real.me.crossed, true);
});

void test('one arrow per stone, first come; one carving per player per day', async () => {
  const e = new Engine(new MemoryStore());
  const first = await e.fall(DAY, 'ann', pitPath);
  assert.equal(first.me.uncarved, first.grave.i);
  await e.carve(DAY, 'ann', first.grave.i, arrowFor(first.grave.i));
  // ann's second fall: she already carved today
  const again = await e.fall(DAY, 'ann', pitPath);
  assert.equal(again.me.uncarved, null);
  // ben falls from the same stone: it already has an arrow
  const ben = await e.fall(DAY, 'ben', pitPath);
  assert.equal(ben.me.uncarved, null);
  assert.equal(ben.grave.falls, 3);
  assert.equal(ben.grave.top?.user, 'ann');
  // ben's carving is still unused, so he can carve on a fresh stone later
  const otherPit = board.pits.findIndex((p, i) => p && i !== idx(pitPath.at(-1)!.c, pitPath.at(-1)!.r) && neighbors(i % COLS, Math.floor(i / COLS)).some((n) => !board.pits[idx(n.c, n.r)]));
  assert.ok(otherPit >= 0);
});

void test('arrows earn saved and fooled credit from later walkers', async () => {
  const e = new Engine(new MemoryStore());
  const lastSafe = pitPath.length >= 2 ? pitPath[pitPath.length - 2]! : START;
  const stone = idx(lastSafe.c, lastSafe.r);
  // a liar points at a stone that is not a pit
  await e.fall(DAY, 'liar', pitPath);
  const lie = validDirections(board, lastSafe).find((d) => !arrowIsTrue(board, stone, d))!;
  await e.carve(DAY, 'liar', stone, lie);
  // someone trusts it, steps off the same stone into the pit: fooled
  await e.fall(DAY, 'victim', pitPath);
  const init = await e.init(DAY, 'liar', 't3_x');
  assert.equal(init.me.myArrow?.truthful, false);
  assert.equal(init.me.myArrow?.fooled, 1);
});

void test('carving can be skipped until the last candle, which must carve', async () => {
  const e = new Engine(new MemoryStore());
  const stone = (f: { grave: { i: number } }) => f.grave.i;
  const f1 = await e.fall(DAY, 'sky', pitPath);
  assert.equal(f1.me.uncarvedSkippable, true);
  const s1 = await e.skip(DAY, 'sky', stone(f1));
  assert.equal(s1.me.uncarved, null);
  // the skipped stone is free again for someone else
  const other = await e.fall(DAY, 'other', pitPath);
  assert.equal(other.me.uncarved, stone(f1));
  await e.carve(DAY, 'other', stone(other), arrowFor(stone(other)));
  // sky's second fall: same stone, now taken, candles remain → nothing to carve
  const f2 = await e.fall(DAY, 'sky', pitPath);
  assert.equal(f2.me.uncarved, null);
  // sky's last candle must carve: the taken stone's arrow will be replaced
  const f3 = await e.fall(DAY, 'sky', pitPath);
  assert.equal(f3.me.uncarved, stone(f3));
  assert.equal(f3.me.uncarvedSkippable, false);
  assert.equal(f3.me.uncarvedReplaces, true);
  await assert.rejects(e.skip(DAY, 'sky', stone(f3)), /last candle/);
  await e.carve(DAY, 'sky', stone(f3), arrowFor(stone(f3)));
  const init = await e.init(DAY, 'other', 't3_x');
  assert.equal(init.graves.find((g) => g.i === stone(f3))?.top?.user, 'sky');
  assert.equal(init.me.myArrow?.crumbled, true, "the replaced arrow crumbled but kept its record");
});

void test('a slab crumbles after five walkers stand on it', async () => {
  const e = new Engine(new MemoryStore());
  const f = await e.fall(DAY, 'author', pitPath);
  await e.carve(DAY, 'author', f.grave.i, arrowFor(f.grave.i));
  for (let k = 0; k < 5; k++) {
    // each walker stands on the slab stone on their way into the same pit
    await e.fall(DAY, `walker${k}`, pitPath);
  }
  const init = await e.init(DAY, 'author', 't3_x');
  assert.ok(!init.graves.some((g) => g.i === f.grave.i), 'crumbled slabs leave the board');
  assert.equal(init.me.myArrow?.crumbled, true);
  assert.equal(init.me.myArrow?.visits, 5);
});

void test('concurrent skip and carve requests settle a fall exactly once', async () => {
  const e = new Engine(new MemoryStore());
  const f = await e.fall(DAY, 'racer', pitPath);
  const i = f.grave.i;
  const results = await Promise.allSettled([e.skip(DAY, 'racer', i), e.skip(DAY, 'racer', i), e.carve(DAY, 'racer', i, arrowFor(i))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  // the stone's claim never went negative: exactly one later faller can carve it if it was released
  const a = await e.fall(DAY, 'next1', pitPath);
  const b = await e.fall(DAY, 'next2', pitPath);
  assert.ok([a.me.uncarved, b.me.uncarved].filter((x) => x !== null).length <= 1);
});

void test('rejects forged runs', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.cross(DAY, 'dave', [{ c: 3, r: 0 }]), GameError);
  await assert.rejects(e.fall(DAY, 'dave', crossPath), GameError);
  await assert.rejects(e.fall(DAY, 'dave', 'nope'), GameError);
});
