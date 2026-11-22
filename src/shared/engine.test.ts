import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, START, cellOf, dayNumber, generateBoard, idx, neighbors, type Cell } from './board.ts';
import { directionBetween, validDirections } from './epitaphs.ts';
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
      if (seen.has(ni)) continue;
      seen.add(ni);
      prev.set(ni, cur);
      if (target(n)) {
        const path: Cell[] = [];
        for (let at = ni; at !== s; at = prev.get(at)!) path.unshift({ c: at % COLS, r: Math.floor(at / COLS) });
        return path;
      }
      if (!board.pits[ni] && n.r !== 0) q.push(ni);
    }
  }
  throw new Error('no path');
};

const pitPath = pathTo((c) => board.pits[idx(c.c, c.r)] === true);
const crossPath = pathTo((c) => c.r === 0 && !board.pits[idx(c.c, c.r)]);
const arrowFor = (stone: number): number => validDirections(cellOf(stone))[0]!;

void test('fall → carve → vote → cross loop', async () => {
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

  const id = carved.grave.top!.id;
  await assert.rejects(e.vote(DAY, 'alice', id, 'honest'), GameError); // no self-votes
  const v = await e.vote(DAY, 'bob', id, 'liar');
  assert.equal(v.epitaph.liar, 1);
  assert.equal(v.epitaph.myVote, 'liar');
  await assert.rejects(e.vote(DAY, 'bob', id, 'honest'), GameError); // one vote

  const crossed = await e.cross(DAY, 'alice', crossPath);
  assert.equal(crossed.me.crossed, true);
  assert.equal(crossed.me.rank, 1);
  assert.equal(crossed.me.streak, 1);
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
    await e.carve(DAY, 'carol', f.grave.i, arrowFor(f.grave.i));
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
  const f = await e.fall(DAY, 'faller', pitPath);
  await e.carve(DAY, 'faller', f.grave.i, arrowFor(f.grave.i));
  const late = await e.cross(DAY, 'late', crossPath);
  assert.ok(late.me.pioneer !== null && late.me.pioneer < 100);
  // your own falls never count against you
  const g = await e.fall(DAY, 'solo', pitPath);
  await e.carve(DAY, 'solo', g.grave.i, arrowFor(g.grave.i));
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

void test('rejects forged runs', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.cross(DAY, 'dave', [{ c: 3, r: 0 }]), GameError);
  await assert.rejects(e.fall(DAY, 'dave', crossPath), GameError);
  await assert.rejects(e.fall(DAY, 'dave', 'nope'), GameError);
});
