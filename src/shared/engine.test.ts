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
  const share = await e.claimShare(DAY, 'sam', '   my own   caption  ');
  assert.equal(share.title, 'my own caption');
  assert.equal(share.card.kind, 'result');
  assert.equal(share.card.crossed, true);
  assert.equal(share.card.user, 'sam');
  await assert.rejects(e.claimShare(DAY, 'sam'), /already/);
  await e.confirmShare(DAY, 'sam', false);
  const again = await e.claimShare(DAY, 'sam', '');
  assert.match(again.title, /^I crossed .+ in \d+:\d\d as a Pioneer\. Here Lies, day \d+\.$/, 'an empty caption falls back to the default');
  const me = await e.confirmShare(DAY, 'sam', true);
  assert.equal(me.shared, true);
  await assert.rejects(e.claimShare(DAY, 'sam'), /already/);
});

void test('crossings are timed from the first step in, and ranked by speed among today\'s crossers', async () => {
  const e = new Engine(new MemoryStore());
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  try {
    await e.start(DAY, 'slow');
    await e.start(DAY, 'quick');
    await e.start(DAY, 'mid');
    await e.start(DAY, 'quick'); // starting again never resets your clock
    await assert.rejects(e.flairFor(DAY, 'quick'), /Cross/);
    clock += 30_000;
    const q = await e.cross(DAY, 'quick', crossPath);
    assert.equal(q.me.time, 30_000);
    assert.deepEqual(q.me.standing, { position: 1, total: 1, percent: 100, title: 'Pioneer' }, 'the first across is a Pioneer');
    clock += 60_000;
    const m = await e.cross(DAY, 'mid', crossPath);
    assert.equal(m.me.time, 90_000);
    clock += 60_000;
    const sl = await e.cross(DAY, 'slow', crossPath);
    assert.equal(sl.me.time, 150_000);
    assert.equal(sl.me.standing?.position, 3);
    assert.equal(sl.me.standing?.title, 'Grave-walker');
    // standings are live: re-read later, everyone sees where they stand now
    const quick = await e.init(DAY, 'quick', 't3_x');
    assert.deepEqual(quick.me.standing, { position: 1, total: 3, percent: 34, title: 'Pioneer' });
    const mid = await e.init(DAY, 'mid', 't3_x');
    assert.equal(mid.me.standing?.title, 'Wayfarer');
    const flair = await e.flairFor(DAY, 'quick');
    assert.match(flair.text, /^Pioneer · Here Lies day /);
    assert.ok(!flair.text.includes(','));
  } finally {
    Date.now = realNow;
  }
});

void test('logged-out placeholders can never act, and real names are never mistaken for them', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.cross(DAY, '~anonymous', crossPath), /Log in/);
  await assert.rejects(e.flairFor(DAY, '~anonymous'), /Log in/);
  await assert.rejects(e.claimShare(DAY, '~anonymous'), /Log in/);
  const real = await e.cross(DAY, 'anonymous', crossPath); // a real Reddit user may be called this
  assert.equal(real.me.crossed, true);
});

void test('one arrow shown per stone, first come; later carvings wait beneath it', async () => {
  const e = new Engine(new MemoryStore());
  const first = await e.fall(DAY, 'ann', pitPath);
  assert.equal(first.me.uncarved, first.grave.i);
  await e.carve(DAY, 'ann', first.grave.i, arrowFor(first.grave.i));
  // ann's second fall: she already carved today
  const again = await e.fall(DAY, 'ann', pitPath);
  assert.equal(again.me.uncarved, null);
  // ben falls from the same stone: it already has an arrow, so his would wait beneath it
  const ben = await e.fall(DAY, 'ben', pitPath);
  assert.equal(ben.me.uncarved, first.grave.i);
  assert.equal(ben.me.uncarvedQueued, true);
  assert.equal(ben.grave.falls, 3);
  assert.equal(ben.grave.top?.user, 'ann');
  const carved = await e.carve(DAY, 'ben', ben.grave.i, arrowFor(ben.grave.i));
  assert.equal(carved.grave.top?.user, 'ann', 'the shown arrow does not change');
  assert.equal(carved.me.myArrow?.waiting, true);
});

void test('when a slab crumbles, the arrow waiting beneath it rises silently', async () => {
  const e = new Engine(new MemoryStore());
  const f = await e.fall(DAY, 'first', pitPath);
  await e.carve(DAY, 'first', f.grave.i, arrowFor(f.grave.i));
  const q = await e.fall(DAY, 'second', pitPath);
  const lie = validDirections(board, cellOf(q.grave.i)).find((d) => d !== arrowFor(q.grave.i))!;
  await e.carve(DAY, 'second', q.grave.i, lie);
  // second's own fall already stood on the slab once; four more walkers break it
  for (let k = 0; k < 4; k++) await e.fall(DAY, `walker${k}`, pitPath);
  const init = await e.init(DAY, 'second', 't3_x');
  const slab = init.graves.find((g) => g.i === f.grave.i);
  assert.equal(slab?.top?.user, 'second', 'the waiting arrow took the stone');
  assert.equal(slab?.top?.arrow, lie);
  assert.equal(slab?.top?.visits, 0, 'it starts fresh, uncracked');
  assert.equal(init.me.myArrow?.waiting, false);
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

void test('carving is always optional, even on the last candle', async () => {
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
  // sky's second fall: same stone, now taken: sky may carve (it would wait beneath) or skip
  const f2 = await e.fall(DAY, 'sky', pitPath);
  assert.equal(f2.me.uncarved, stone(f2));
  assert.equal(f2.me.uncarvedQueued, true);
  await e.skip(DAY, 'sky', stone(f2));
  // even sky's last candle may leave no mark: a whole day without carving is allowed
  const f3 = await e.fall(DAY, 'sky', pitPath);
  assert.equal(f3.me.uncarved, stone(f3));
  assert.equal(f3.me.uncarvedSkippable, true);
  assert.equal(f3.me.uncarvedQueued, true);
  const s3 = await e.skip(DAY, 'sky', stone(f3));
  assert.equal(s3.me.uncarved, null);
  assert.equal(s3.me.candles, 0);
  assert.equal(s3.me.myArrow, null, 'sky never carved today');
  const init = await e.init(DAY, 'other', 't3_x');
  assert.equal(init.graves.find((g) => g.i === stone(f3))?.top?.user, 'other');
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
  // the stone's claim never went negative: at most one later faller holds the stone itself
  const a = await e.fall(DAY, 'next1', pitPath);
  const b = await e.fall(DAY, 'next2', pitPath);
  assert.ok([a.me, b.me].filter((m) => m.uncarved !== null && !m.uncarvedQueued).length <= 1);
});

void test('rejects forged runs', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.cross(DAY, 'dave', [{ c: 3, r: 0 }]), GameError);
  await assert.rejects(e.fall(DAY, 'dave', crossPath), GameError);
  await assert.rejects(e.fall(DAY, 'dave', 'nope'), GameError);
});
