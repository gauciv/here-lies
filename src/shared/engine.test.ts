import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, START, dayNumber, generateBoard, idx, neighbors, type Cell } from './board.ts';
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

void test('fall → carve → vote → cross loop', async () => {
  const e = new Engine(new MemoryStore());
  const fell = await e.fall(DAY, 'alice', pitPath);
  assert.equal(fell.me.candles, 2);
  assert.equal(fell.day.fallen, 1);
  const i = fell.grave.i;
  assert.equal(fell.me.uncarved, i);

  await assert.rejects(e.cross(DAY, 'alice', crossPath), GameError); // must carve first
  const carved = await e.carve(DAY, 'alice', i, 3);
  assert.equal(carved.grave.top?.text, 3);
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
  assert.equal(init.graves.length, 1);
  assert.equal(init.day.crossed, 1);
});

void test('candles run out after three falls', async () => {
  const e = new Engine(new MemoryStore());
  for (let k = 0; k < 3; k++) {
    const f = await e.fall(DAY, 'carol', pitPath);
    await e.carve(DAY, 'carol', f.grave.i, 0);
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

void test('rejects forged runs', async () => {
  const e = new Engine(new MemoryStore());
  await assert.rejects(e.cross(DAY, 'dave', [{ c: 3, r: 0 }]), GameError);
  await assert.rejects(e.fall(DAY, 'dave', crossPath), GameError);
  await assert.rejects(e.fall(DAY, 'dave', 'nope'), GameError);
});
