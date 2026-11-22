// Authoritative game rules over a tiny key-value interface. The Devvit server
// runs this against Redis; the local preview runs it against an in-memory map.
//
// Graves: a fall lays a slab on the last safe stone the walker stood on. The
// first to fall from a stone carves its one arrow (truth or lie), and each
// player carves at most once per day. Arrows are judged by the game itself:
// it counts who an arrow saved (stepped off its stone safely when it told the
// truth) and who it fooled (fell from its stone when it lied).
import { CANDLES_PER_DAY, ROWS, cellOf, dayNumber, difficultyOf, generateBoard, idx, judgeRun, mulberry32, neighbors, type Cell } from './board';
import { CRUMBLE_AFTER, FORGOTTEN, MAX_ARROWS, arrowIsTrue, directionBetween, isAnonymous, isDirection, validDirections } from './epitaphs';
import { canShare, shareText } from './share';
import { pioneerFlair, pioneerScore, type Flair } from './pioneer';
import type { CarveResponse, CrossResponse, DayDto, EpitaphDto, FallResponse, GraveDto, InitResponse, MeDto, MyArrowDto, SkipResponse } from './api';

export type Store = {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  incrBy(key: string, n: number): Promise<number>;
  hGet(key: string, field: string): Promise<string | undefined>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, values: Record<string, string>): Promise<void>;
  hSetNX(key: string, field: string, value: string): Promise<boolean>;
  hIncrBy(key: string, field: string, n: number): Promise<number>;
  zAdd(key: string, member: string, score: number): Promise<void>;
  zIncrBy(key: string, member: string, n: number): Promise<number>;
  /** members ordered by score, highest first */
  zTop(key: string, count: number): Promise<string[]>;
  zCard(key: string): Promise<number>;
};

export class GameError extends Error {}

/** Bump when the stored shape changes, so old days don't mix with new rules. */
const NS = 'v6:';

const K = {
  stats: (d: number) => `${NS}d:${d}:stats`,
  /** deaths per pit (server-only; drives the pioneer score) */
  falls: (d: number) => `${NS}d:${d}:falls`,
  /** deaths per slab stone */
  slabFalls: (d: number) => `${NS}d:${d}:slabfalls`,
  /** stone → epitaph id of its active arrow ('' once it has crumbled) */
  slabArrow: (d: number) => `${NS}d:${d}:slabarrow`,
  /** stone → claim counter (first claimant carves) */
  slabClaim: (d: number) => `${NS}d:${d}:slabclaim`,
  /** `${stone}:${epId}` → 1 while an arrow waits beneath a slab, 2 once it has risen */
  slabQueue: (d: number) => `${NS}d:${d}:slabqueue`,
  ep: (d: number, id: string) => `${NS}d:${d}:ep:${id}`,
  epSeq: (d: number) => `${NS}d:${d}:epseq`,
  user: (d: number, u: string) => `${NS}d:${d}:u:${u}`,
  streak: (u: string) => `u:${u}:streak`,
  seededCells: (d: number) => `${NS}d:${d}:seeded`,
};

const num = (v: string | undefined, fallback = 0): number => {
  const n = v === undefined ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const parseList = (v: string | undefined): number[] => {
  if (!v) return [];
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
};

const isCellArray = (v: unknown): v is Cell[] =>
  Array.isArray(v) &&
  v.every((p) => typeof p === 'object' && p !== null && 'c' in p && 'r' in p && Number.isInteger(p.c) && Number.isInteger(p.r));

export const parsePath = (v: unknown): Cell[] => {
  if (!isCellArray(v)) throw new GameError('Malformed path');
  return v.map((p) => ({ c: p.c, r: p.r }));
};

export class Engine {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  private async dayDto(day: number): Promise<DayDto> {
    const s = await this.store.hGetAll(K.stats(day));
    return { day, room: generateBoard(day).name, fallen: num(s.fallen), crossed: num(s.crossed) };
  }

  private async myArrow(day: number, epId: string | undefined): Promise<MyArrowDto | null> {
    if (!epId) return null;
    const e = await this.store.hGetAll(K.ep(day, epId));
    if (!e.user) return null;
    const arrow = num(e.arrow);
    return {
      stone: num(e.i),
      arrow,
      truthful: arrowIsTrue(generateBoard(day), num(e.i), arrow),
      saved: num(e.saved),
      fooled: num(e.fooled),
      visits: num(e.visits),
      crumbled: e.crumbled === '1',
      waiting: e.queued === '1',
    };
  }

  private async me(day: number, user: string): Promise<MeDto> {
    const u = await this.store.hGetAll(K.user(day, user));
    const st = await this.store.hGetAll(K.streak(user));
    const last = num(st.last, -99);
    return {
      username: user,
      candles: Math.max(0, CANDLES_PER_DAY - num(u.spent)),
      crossed: u.crossed === '1',
      rank: u.rank ? num(u.rank) : null,
      steps: u.steps ? num(u.steps) : null,
      revealed: parseList(u.revealed),
      uncarved: u.uncarved ? num(u.uncarved) : null,
      uncarvedSkippable: u.uncarvedSkippable === '1',
      uncarvedQueued: u.uncarvedQueued === '1',
      fellInto: parseList(u.fellAt),
      streak: last >= day - 1 ? num(st.count) : 0,
      bestStreak: Math.max(num(st.best), last >= day - 1 ? num(st.count) : 0),
      shared: u.shared === '1',
      pioneer: u.pioneer ? num(u.pioneer) : null,
      myArrow: await this.myArrow(day, u.myEp),
    };
  }

  private async epitaph(day: number, id: string): Promise<EpitaphDto | null> {
    const e = await this.store.hGetAll(K.ep(day, id));
    if (!e.user) return null;
    const arrow = num(e.arrow);
    return {
      id,
      user: e.user,
      arrow: isDirection(arrow) ? arrow : 0,
      step: num(e.step),
      at: num(e.at),
      saved: num(e.saved),
      fooled: num(e.fooled),
      visits: num(e.visits),
    };
  }

  private async grave(day: number, i: number, viewer: string): Promise<GraveDto> {
    const [falls, epId, mineList] = await Promise.all([
      this.store.hGet(K.slabFalls(day), String(i)),
      this.store.hGet(K.slabArrow(day), String(i)),
      this.store.hGet(K.user(day, viewer), 'diedFrom'),
    ]);
    return {
      i,
      falls: num(falls),
      top: epId ? await this.epitaph(day, epId) : null,
      mine: parseList(mineList).includes(i),
    };
  }

  /**
   * The slab's arrow crumbles. If another arrow waits beneath it, that one rises
   * in its place without a sound, so nobody can tell the slab changed hands;
   * otherwise the stone is freed. The safety cap crumbles without promoting
   * (it must actually thin the board); the queue then waits for the next slab.
   */
  private async crumble(day: number, stone: number, epId: string, promote = true): Promise<void> {
    await this.store.hSet(K.ep(day, epId), { crumbled: '1' });
    if ((await this.store.hGet(K.slabArrow(day), String(stone))) !== epId) return;
    const next = promote ? await this.riseFromQueue(day, stone) : null;
    if (next) {
      await this.store.hSet(K.slabArrow(day), { [String(stone)]: next });
      return;
    }
    await this.store.hSet(K.slabArrow(day), { [String(stone)]: '' });
    await this.store.hSet(K.slabClaim(day), { [String(stone)]: '0' });
  }

  /** Take the oldest arrow waiting beneath this stone, atomically; null if none. */
  private async riseFromQueue(day: number, stone: number): Promise<string | null> {
    const queue = await this.store.hGetAll(K.slabQueue(day));
    const waiting = Object.entries(queue)
      .filter(([field, v]) => v === '1' && field.startsWith(`${stone}:`))
      .map(([field]) => field.slice(String(stone).length + 1))
      .sort((a, b) => Number(a) - Number(b));
    for (const id of waiting) {
      // 1 → 2 claims it; a racing crumble that sees 3 moves on
      if ((await this.store.hIncrBy(K.slabQueue(day), `${stone}:${id}`, 1)) !== 2) continue;
      await this.store.hSet(K.ep(day, id), { queued: '0', at: String(Date.now()) });
      return id;
    }
    return null;
  }

  private async writeArrow(day: number, stone: number, fields: Record<string, string>): Promise<string> {
    const id = String(await this.store.incrBy(K.epSeq(day), 1));
    await this.store.hSet(K.ep(day, id), { ...fields, i: String(stone), saved: '0', fooled: '0', visits: '0' });
    await this.store.hSet(K.slabArrow(day), { [String(stone)]: id });
    // safety ceiling: past it, the oldest arrow crumbles
    const active = Object.entries(await this.store.hGetAll(K.slabArrow(day))).filter(([, v]) => v);
    if (active.length > MAX_ARROWS) {
      const [oldStone, oldId] = active.sort((x, y) => Number(x[1]) - Number(y[1]))[0]!;
      await this.crumble(day, Number(oldStone), oldId, false);
    }
    return id;
  }

  /** An arrow carved on a taken stone: it waits, unseen, beneath the slab above it. */
  private async queueArrow(day: number, stone: number, fields: Record<string, string>): Promise<string> {
    const id = String(await this.store.incrBy(K.epSeq(day), 1));
    await this.store.hSet(K.ep(day, id), { ...fields, i: String(stone), saved: '0', fooled: '0', visits: '0', queued: '1' });
    await this.store.hSet(K.slabQueue(day), { [`${stone}:${id}`]: '1' });
    return id;
  }

  /**
   * Lay a few nameless slabs on a fresh day so the first players already meet
   * arrows to trust or doubt. They never count toward the day's "fallen".
   */
  private async ensureSeeded(day: number): Promise<void> {
    if (!(await this.store.hSetNX(K.stats(day), 'seeded', '1'))) return;
    const board = generateBoard(day);
    const rand = mulberry32(day * 7919 + 17);
    const { honesty } = difficultyOf(day);
    // pits in the lower and middle rows that touch a walkable stone: where walkers meet them
    const candidates = board.pits
      .map((p, i) => (p ? i : -1))
      .filter((i) => {
        if (i < 0) return false;
        const { c, r } = cellOf(i);
        return r >= 2 && r <= ROWS - 3 && neighbors(c, r).some((n) => !board.pits[idx(n.c, n.r)] && !board.walls[idx(n.c, n.r)]);
      });
    for (let k = candidates.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      [candidates[k], candidates[j]] = [candidates[j]!, candidates[k]!];
    }
    const at = Date.now() - 6 * 3_600_000;
    const used = new Set<number>();
    for (const pit of candidates) {
      if (used.size >= 3) break;
      const p = cellOf(pit);
      const stones = neighbors(p.c, p.r)
        .map((n) => idx(n.c, n.r))
        .filter((n) => !board.pits[n] && !board.walls[n] && !used.has(n) && n !== idx(board.start.c, board.start.r));
      if (!stones.length) continue;
      const stone = stones[Math.floor(rand() * stones.length)]!;
      used.add(stone);
      const truth = directionBetween(cellOf(stone), p) ?? 0;
      const others = validDirections(board, cellOf(stone)).filter((d) => !arrowIsTrue(board, stone, d));
      const arrow = rand() < honesty || !others.length ? truth : others[Math.floor(rand() * others.length)]!;
      await this.store.hIncrBy(K.slabClaim(day), String(stone), 1);
      await this.writeArrow(day, stone, { user: FORGOTTEN, arrow: String(arrow), step: '0', at: String(at) });
      await this.store.hIncrBy(K.slabFalls(day), String(stone), 1);
      await this.store.hIncrBy(K.falls(day), String(pit), 1);
      await this.store.hSet(K.seededCells(day), { [String(pit)]: '1' });
    }
  }

  async init(day: number, user: string, postId: string): Promise<InitResponse> {
    await this.ensureSeeded(day);
    const [dayDto, me, graves] = await Promise.all([this.dayDto(day), this.me(day, user), this.graves(day, user)]);
    return { type: 'init', postId, day: dayDto, graves, me };
  }

  /** Every slab that still carries an arrow (only these are on the board). */
  private async graves(day: number, viewer: string): Promise<GraveDto[]> {
    const arrows = await this.store.hGetAll(K.slabArrow(day));
    const cells = Object.entries(arrows).filter(([, id]) => id).map(([cell]) => Number(cell));
    return Promise.all(cells.map((i) => this.grave(day, i, viewer)));
  }

  /**
   * Remember the stones a walker revealed, and let the arrows they passed
   * take credit: a truthful arrow saved them if they stepped off its stone
   * safely; a lying arrow fooled them if they fell from its stone.
   */
  private async recordPath(day: number, user: string, path: Cell[]): Promise<void> {
    const board = generateBoard(day);
    const u = await this.store.hGetAll(K.user(day, user));
    const revealed = new Set(parseList(u.revealed));
    revealed.add(idx(board.start.c, board.start.r));
    for (const p of path) if (!board.pits[idx(p.c, p.r)]) revealed.add(idx(p.c, p.r));
    await this.store.hSet(K.user(day, user), { revealed: JSON.stringify([...revealed]) });

    const arrows = await this.store.hGetAll(K.slabArrow(day));
    const credited = new Set<string>();
    for (let k = 0; k < path.length; k++) {
      const from = k === 0 ? board.start : path[k - 1]!;
      const to = path[k]!;
      const epId = arrows[String(idx(from.c, from.r))];
      if (!epId || credited.has(epId)) continue;
      const e = await this.store.hGetAll(K.ep(day, epId));
      if (!e.user || e.user === user) continue;
      const truthful = arrowIsTrue(board, num(e.i), num(e.arrow));
      const fell = board.pits[idx(to.c, to.r)] === true;
      if (truthful && !fell) await this.store.hIncrBy(K.ep(day, epId), 'saved', 1);
      else if (!truthful && fell) await this.store.hIncrBy(K.ep(day, epId), 'fooled', 1);
      else continue;
      credited.add(epId);
    }

    // every slab they stood on wears; at CRUMBLE_AFTER walkers it crumbles
    const stood = new Set<number>([idx(board.start.c, board.start.r)]);
    for (const p of path) if (!board.pits[idx(p.c, p.r)]) stood.add(idx(p.c, p.r));
    for (const stone of stood) {
      const epId = arrows[String(stone)];
      if (!epId) continue;
      const author = await this.store.hGet(K.ep(day, epId), 'user');
      if (!author || author === user) continue;
      const visits = await this.store.hIncrBy(K.ep(day, epId), 'visits', 1);
      if (visits >= CRUMBLE_AFTER) await this.crumble(day, stone, epId);
    }
  }

  private async assertCanWalk(day: number, user: string): Promise<MeDto> {
    if (isAnonymous(user)) throw new GameError('Log in to walk the crossing');
    const me = await this.me(day, user);
    if (me.crossed) throw new GameError('You already crossed today');
    if (me.candles <= 0) throw new GameError('Your candles are spent for today');
    if (me.uncarved !== null) throw new GameError('Carve your arrow first');
    return me;
  }

  /**
   * Decide what this fall may carve, atomically. Each player carves once a day.
   * The first to fall from a stone carves its slab; anyone after them can still
   * carve, and their arrow waits hidden beneath it until the slab above crumbles.
   */
  private async claimCarving(day: number, user: string, stone: number): Promise<'carve' | 'queue' | 'none'> {
    if ((await this.store.hIncrBy(K.user(day, user), 'carveClaim', 1)) > 1) {
      await this.store.hIncrBy(K.user(day, user), 'carveClaim', -1);
      return 'none';
    }
    if ((await this.store.hIncrBy(K.slabClaim(day), String(stone), 1)) === 1) return 'carve';
    await this.store.hIncrBy(K.slabClaim(day), String(stone), -1);
    return 'queue';
  }

  async fall(day: number, user: string, rawPath: unknown): Promise<FallResponse> {
    const path = parsePath(rawPath);
    await this.assertCanWalk(day, user);
    const board = generateBoard(day);
    const outcome = judgeRun(board, path);
    if (outcome.kind !== 'fell') throw new GameError('That walk did not end in a pit');
    const pit = idx(outcome.at.c, outcome.at.r);
    // the slab goes where they last stood safely: the stone before the pit
    const from = path.length >= 2 ? path[path.length - 2]! : board.start;
    const stone = idx(from.c, from.r);
    // consume a candle atomically; concurrent requests can't overspend
    const spent = await this.store.hIncrBy(K.user(day, user), 'spent', 1);
    if (spent > CANDLES_PER_DAY) {
      await this.store.hIncrBy(K.user(day, user), 'spent', -1);
      throw new GameError('Your candles are spent for today');
    }
    await this.recordPath(day, user, path);
    const carving = await this.claimCarving(day, user, stone);
    const u = await this.store.hGetAll(K.user(day, user));
    const fellAt = parseList(u.fellAt);
    fellAt.push(pit);
    const diedFrom = parseList(u.diedFrom);
    diedFrom.push(stone);
    await Promise.all([
      this.store.hSet(K.user(day, user), {
        ...(carving !== 'none'
          ? {
              uncarved: String(stone),
              uncarvedStep: String(outcome.steps),
              uncarvedSkippable: '1', // carving is always a choice, even on your last candle
              uncarvedToken: String(spent),
              uncarvedQueued: carving === 'queue' ? '1' : '0',
            }
          : {}),
        fellAt: JSON.stringify(fellAt),
        diedFrom: JSON.stringify(diedFrom),
      }),
      this.store.hIncrBy(K.falls(day), String(pit), 1),
      this.store.hIncrBy(K.slabFalls(day), String(stone), 1),
      this.store.hIncrBy(K.stats(day), 'fallen', 1),
    ]);
    const [meDto, grave, dayDto, graves] = await Promise.all([this.me(day, user), this.grave(day, stone, user), this.dayDto(day), this.graves(day, user)]);
    return { type: 'fall', me: meDto, grave, day: dayDto, graves };
  }

  async carve(day: number, user: string, i: number, arrow: unknown): Promise<CarveResponse> {
    if (!isDirection(arrow)) throw new GameError('Pick a direction to carve');
    const u = await this.store.hGetAll(K.user(day, user));
    if (!u.uncarved || num(u.uncarved) !== i) throw new GameError('Nothing to carve here');
    if (!validDirections(generateBoard(day), cellOf(i)).includes(arrow)) throw new GameError('That arrow points at no stone');
    // carve and skip race for the same one-time token; only the first wins
    if (!(await this.store.hSetNX(K.user(day, user), `resolved:${u.uncarvedToken ?? ''}`, 'carve'))) throw new GameError('This fall is already settled');
    if (!(await this.store.hSetNX(K.user(day, user), 'carved', '1'))) throw new GameError('Your arrow is already carved');
    const fields = { user, arrow: String(arrow), step: u.uncarvedStep ?? '0', at: String(Date.now()) };
    // a queued carving takes the stone after all if its slab crumbled meanwhile
    const queued = u.uncarvedQueued === '1' && (await this.store.hIncrBy(K.slabClaim(day), String(i), 1)) !== 1;
    if (u.uncarvedQueued === '1' && queued) await this.store.hIncrBy(K.slabClaim(day), String(i), -1);
    const id = queued ? await this.queueArrow(day, i, fields) : await this.writeArrow(day, i, fields);
    await this.store.hSet(K.user(day, user), { uncarved: '', uncarvedStep: '', uncarvedSkippable: '', uncarvedQueued: '', myEp: id });
    const [grave, me] = await Promise.all([this.grave(day, i, user), this.me(day, user)]);
    return { type: 'carve', grave, me };
  }

  /** Leave no arrow on this fall. Always allowed: nobody has to carve. */
  async skip(day: number, user: string, i: number): Promise<SkipResponse> {
    const u = await this.store.hGetAll(K.user(day, user));
    if (!u.uncarved || num(u.uncarved) !== i) throw new GameError('Nothing to carve here');
    if (!(await this.store.hSetNX(K.user(day, user), `resolved:${u.uncarvedToken ?? ''}`, 'skip'))) throw new GameError('This fall is already settled');
    // release your claims so the stone (if you held it) and your one carving stay available
    if (u.uncarvedQueued !== '1') await this.store.hIncrBy(K.slabClaim(day), String(i), -1);
    await this.store.hIncrBy(K.user(day, user), 'carveClaim', -1);
    await this.store.hSet(K.user(day, user), { uncarved: '', uncarvedStep: '', uncarvedSkippable: '', uncarvedQueued: '' });
    return { type: 'skip', me: await this.me(day, user) };
  }

  /** Share of open pits that other real players had not yet marked, right now. */
  private async pioneerFor(day: number, user: string): Promise<number> {
    const [falls, seeded, u] = await Promise.all([
      this.store.hGetAll(K.falls(day)),
      this.store.hGetAll(K.seededCells(day)),
      this.store.hGetAll(K.user(day, user)),
    ]);
    const mine = parseList(u.fellAt);
    let marked = 0;
    for (const [cell, count] of Object.entries(falls)) {
      const i = Number(cell);
      const others = num(count) - (seeded[cell] ? 1 : 0) - mine.filter((m) => m === i).length;
      if (others > 0) marked++;
    }
    const pits = generateBoard(day).pits.filter(Boolean).length;
    return pioneerScore(pits, Object.keys(seeded).length, marked);
  }

  async cross(day: number, user: string, rawPath: unknown): Promise<CrossResponse> {
    const path = parsePath(rawPath);
    await this.assertCanWalk(day, user);
    const outcome = judgeRun(generateBoard(day), path);
    if (outcome.kind !== 'crossed') throw new GameError('That walk did not reach the far wall');
    if (!(await this.store.hSetNX(K.user(day, user), 'crossLock', '1'))) throw new GameError('You already crossed today');
    const rank = await this.store.hIncrBy(K.stats(day), 'crossed', 1);
    const pioneer = await this.pioneerFor(day, user);
    await this.store.hSet(K.user(day, user), { crossed: '1', rank: String(rank), steps: String(outcome.steps), pioneer: String(pioneer) });
    await this.recordPath(day, user, path);
    // streaks only advance on today's crossing, never by replaying an old post
    if (day === dayNumber()) {
      const st = await this.store.hGetAll(K.streak(user));
      const last = num(st.last, -99);
      const count = last === day - 1 ? num(st.count) + 1 : last === day ? num(st.count) : 1;
      await this.store.hSet(K.streak(user), { last: String(day), count: String(count), best: String(Math.max(count, num(st.best))) });
    }
    const [me, dayDto, graves] = await Promise.all([this.me(day, user), this.dayDto(day), this.graves(day, user)]);
    return { type: 'cross', me, day: dayDto, graves };
  }

  /** The flair a player has earned today (only after crossing). */
  async flairFor(day: number, user: string): Promise<Flair> {
    if (isAnonymous(user)) throw new GameError('Log in to wear a title');
    const me = await this.me(day, user);
    if (!me.crossed || me.pioneer === null) throw new GameError('Cross the dark to earn a title');
    return pioneerFlair(day, me.pioneer);
  }

  /** Claim today's single share; returns the comment text to post. */
  async claimShare(day: number, user: string): Promise<string> {
    if (isAnonymous(user)) throw new GameError('Log in to share');
    const me = await this.me(day, user);
    if (!canShare(me)) throw new GameError('Finish your crossing first');
    // atomic claim: only one concurrent request can hold it
    if ((await this.store.hIncrBy(K.user(day, user), 'shareClaim', 1)) > 1) {
      await this.store.hIncrBy(K.user(day, user), 'shareClaim', -1);
      throw new GameError('You already shared today');
    }
    return shareText(day, me);
  }

  /** Record the outcome; a failed post releases the claim so the player can retry. */
  async confirmShare(day: number, user: string, ok: boolean): Promise<MeDto> {
    if (ok) await this.store.hSet(K.user(day, user), { shared: '1' });
    else await this.store.hIncrBy(K.user(day, user), 'shareClaim', -1);
    return this.me(day, user);
  }
}
