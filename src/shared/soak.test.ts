// End-to-end soak: the real Engine over a MemoryStore across many days (every
// room shape) and many simulated players, checking invariants after every action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, CANDLES_PER_DAY, cellOf, difficultyOf, generateBoard, idx, isOpen, mulberry32, neighbors, judgeRun, type Board } from './board.ts';
import { MAX_ARROWS, arrowIsTrue, validDirections, isForgotten, DIRECTIONS } from './epitaphs.ts';
import { Engine } from './engine.ts';
import { MemoryStore } from './memoryStore.ts';
import { shareText } from './share.ts';
import type { GraveDto, InitResponse, MeDto } from './api.ts';

type Cell = { c: number; r: number };
const problems: string[] = [];
const fail = (day: number, msg: string) => { if (problems.length < 60) problems.push(`day ${day}: ${msg}`); };
const honesty = new Map<string, [number, number]>();

const expectReject = async (day: number, what: string, p: Promise<unknown>) => {
  try { await p; fail(day, `accepted ${what}`); } catch { /* refused, as it should be */ }
};

/** BFS over open, non-pit stones; optional target predicate (target itself may be a pit). */
const bfs = (board: Board, from: Cell, target: (c: Cell) => boolean, rand?: () => number): Cell[] | null => {
  const s = idx(from.c, from.r);
  const prev = new Map<number, number>();
  const q = [s];
  const seen = new Set(q);
  for (let h = 0; h < q.length; h++) {
    const cur = q[h]!;
    const ns = neighbors(cur % COLS, Math.floor(cur / COLS));
    if (rand) ns.sort(() => rand() - 0.5);
    for (const n of ns) {
      const ni = idx(n.c, n.r);
      if (seen.has(ni) || !isOpen(board, n.c, n.r)) continue;
      seen.add(ni); prev.set(ni, cur);
      if (target(n)) {
        const path: Cell[] = [];
        for (let at = ni; at !== s; at = prev.get(at)!) path.unshift(cellOf(at));
        return path;
      }
      if (!board.pits[ni]) q.push(ni);
    }
  }
  return null;
};

const checkState = (day: number, board: Board, res: { me?: MeDto }, user: string) => {
  const me = res.me;
  if (me) {
    if (me.candles < 0 || me.candles > CANDLES_PER_DAY) fail(day, `${user} candles ${me.candles}`);
    for (const i of me.revealed) if (board.walls[i] || board.pits[i]) fail(day, `${user} revealed rock/pit ${i}`);
    if (me.pioneer !== null && (me.pioneer < 0 || me.pioneer > 100)) fail(day, `pioneer ${me.pioneer}`);
    if (me.uncarved !== null && (board.walls[me.uncarved] || board.pits[me.uncarved])) fail(day, `uncarved on rock/pit`);
  }
};

const checkInit = async (engine: Engine, day: number, board: Board) => {
  const init: InitResponse = await engine.init(day, 'observer', 't3_x');
  if (init.day.room !== board.name) fail(day, `room name mismatch`);
  const shown = init.graves.filter((g: GraveDto) => g.top);
  if (shown.length > MAX_ARROWS) fail(day, `${shown.length} arrows on the board`);
  for (const g of init.graves) {
    if (board.walls[g.i]) fail(day, `slab on rock at ${g.i}`);
    if (board.pits[g.i]) fail(day, `slab on a pit at ${g.i}`);
    if (g.top && !validDirections(board, cellOf(g.i)).includes(g.top.arrow)) fail(day, `arrow at ${g.i} points into rock/off board`);
  }
  return init;
};


void test('every room plays end to end with many walkers and no broken invariants', async () => {
  for (let day = 1; day <= 70; day++) {
    const board = generateBoard(day);
    const engine = new Engine(new MemoryStore());
    const rand = mulberry32(day * 7 + 3);

    // fresh day: forgotten slabs seeded, all legal
    const init0 = await checkInit(engine, day, board);
    const forgotten = init0.graves.filter((g: GraveDto) => g.top && isForgotten(g.top.user));
    if (forgotten.length < 1) fail(day, `no forgotten slabs (${board.name})`);
    const tier = difficultyOf(day).name;
    const h = honesty.get(tier) ?? [0, 0];
    for (const g of forgotten) { h[1]++; if (g.top && arrowIsTrue(board, g.i, g.top.arrow)) h[0]++; }
    honesty.set(tier, h);

    // cheats are rejected
    const rockCell = board.walls.findIndex(Boolean);
    if (rockCell >= 0) {
      const toRock = bfs(board, board.start, (c) => idx(c.c, c.r) === rockCell);
      // bfs never enters rock, so build a path to a neighbour and then step into the rock
      const rc = cellOf(rockCell);
      const nb = neighbors(rc.c, rc.r).find((n) => isOpen(board, n.c, n.r) && !board.pits[idx(n.c, n.r)]);
      const pre = nb ? (nb.c === board.start.c && nb.r === board.start.r ? [] : bfs(board, board.start, (c) => c.c === nb.c && c.r === nb.r)) : null;
      if (toRock) fail(day, 'bfs walked into rock');
      if (pre && !pre.some((p) => board.pits[idx(p.c, p.r)])) {
        if (judgeRun(board, [...pre, rc]).kind !== 'invalid') fail(day, 'judgeRun allowed a step into rock');
        await expectReject(day, 'a fall into rock', engine.fall(day, 'cheater', [...pre, rc]));
        await expectReject(day, 'a crossing through rock', engine.cross(day, 'cheater', [...pre, rc]));
      }
    }
    await expectReject(day, 'a teleport crossing', engine.cross(day, 'cheater', [board.door]));
    await expectReject(day, 'an anonymous fall', engine.fall(day, '~anonymous', [board.start]));

    // a perfect player crosses every room with no falls
    const perfect = bfs(board, board.start, (c) => c.c === board.door.c && c.r === board.door.r);
    if (!perfect) { fail(day, `no crossing exists in ${board.name}`); continue; }
    const pc = await engine.cross(day, 'perfect', perfect);
    checkState(day, board, pc, 'perfect');
    if (!pc.me.crossed || pc.me.rank !== 1) fail(day, 'perfect player did not cross first');
    await expectReject(day, 'a second crossing', engine.cross(day, 'perfect', perfect));
    const txt = shareText(day, pc.me);
    if (!txt.includes(board.name)) fail(day, 'share text lacks room name');
    if (/[^\x20-\x7e\n·]/.test(txt)) fail(day, `share text has unsafe chars: ${JSON.stringify(txt)}`);

    // wanderers: walk toward pits or the door, carve/skip, use all candles
    for (let p = 0; p < 14; p++) {
      const user = `walker_${p}`;
      for (let life = 0; life < CANDLES_PER_DAY + 1; life++) {
        const goPit = rand() < 0.7;
        const path = goPit
          ? bfs(board, board.start, (c) => board.pits[idx(c.c, c.r)] === true && rand() < 0.5, rand) ?? bfs(board, board.start, (c) => board.pits[idx(c.c, c.r)] === true, rand)
          : bfs(board, board.start, (c) => c.c === board.door.c && c.r === board.door.r, rand);
        if (!path) { fail(day, `no path for ${user}`); break; }
        const before = await engine.init(day, user, 't3_x');
        const finished = before.me.crossed || before.me.candles <= 0;
        const isFall = board.pits[idx(path.at(-1)!.c, path.at(-1)!.r)];
        if (finished) {
          await expectReject(day, `a walk after finishing (${user})`, isFall ? engine.fall(day, user, path) : engine.cross(day, user, path));
          break;
        }
        if (!isFall) {
          const res = await engine.cross(day, user, path);
          checkState(day, board, res, user);
          break;
        }
        const res = await engine.fall(day, user, path);
        checkState(day, board, res, user);
        if (res.me.candles !== before.me.candles - 1) fail(day, `${user} candle did not burn`);
        if (res.me.uncarved !== null) {
          // must walk-block until carved
          await expectReject(day, 'walking with an uncarved fall', engine.fall(day, user, path));
          const stone = cellOf(res.me.uncarved);
          // an arrow into rock / off the board is refused
          const bad = DIRECTIONS.map((_: unknown, d: number) => d).find((d: number) => !validDirections(board, stone).includes(d));
          if (bad !== undefined) await expectReject(day, 'an arrow into rock or off the edge', engine.carve(day, user, res.me.uncarved, bad));
          if (res.me.uncarvedSkippable && rand() < 0.4) {
            const s = await engine.skip(day, user, res.me.uncarved);
            checkState(day, board, s, user);
          } else {
            const dirs = validDirections(board, stone);
            const c = await engine.carve(day, user, res.me.uncarved, dirs[Math.floor(rand() * dirs.length)]);
            checkState(day, board, c, user);
            await expectReject(day, 'carving twice', engine.carve(day, user, res.me.uncarved ?? 0, dirs[0]));
          }
        }
      }
    }
    const end = await checkInit(engine, day, board);
    if (end.day.fallen < 1) fail(day, 'nobody fell all day');
    // concurrent double-fall by one player cannot overspend
    const pitPath = bfs(board, board.start, (c) => board.pits[idx(c.c, c.r)] === true);
    if (pitPath) {
      const rs = await Promise.allSettled(Array.from({ length: 5 }, () => engine.fall(day, 'racer', pitPath)));
      if (rs.filter((r) => r.status === 'fulfilled').length > CANDLES_PER_DAY) fail(day, `concurrent falls: ${rs.filter((r) => r.status === 'fulfilled').length} accepted`);
    }
  }
  assert.deepEqual(problems, []);
  // the morning's forgotten slabs get less honest as the week gets harder
  const rate = (t: string) => { const [a, b] = honesty.get(t) ?? [0, 1]; return a / b; };
  assert.ok(rate('Gentle') > rate('Tricky') && rate('Tricky') > rate('Cruel'), 'honesty does not fall with the tier');
});
