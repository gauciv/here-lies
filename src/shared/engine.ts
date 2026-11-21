// Authoritative game rules over a tiny key-value interface. The Devvit server
// runs this against Redis; the local preview runs it against an in-memory map.
import { CANDLES_PER_DAY, dayNumber, generateBoard, idx, judgeRun, type Cell } from './board';
import { isEpitaphId } from './epitaphs';
import type {
  CarveResponse,
  CrossResponse,
  DayDto,
  EpitaphDto,
  FallResponse,
  GraveDto,
  GraveResponse,
  InitResponse,
  MeDto,
  Vote,
  VoteResponse,
} from './api';

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

const K = {
  stats: (d: number) => `d:${d}:stats`,
  falls: (d: number) => `d:${d}:falls`,
  cell: (d: number, i: number) => `d:${d}:cell:${i}`,
  ep: (d: number, id: string) => `d:${d}:ep:${id}`,
  epSeq: (d: number) => `d:${d}:epseq`,
  user: (d: number, u: string) => `d:${d}:u:${u}`,
  votes: (d: number, u: string) => `d:${d}:votes:${u}`,
  streak: (u: string) => `u:${u}:streak`,
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

const epScore = (honest: number, liar: number): number => honest - liar * 1.5;

export class Engine {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  private async dayDto(day: number): Promise<DayDto> {
    const s = await this.store.hGetAll(K.stats(day));
    return { day, fallen: num(s.fallen), crossed: num(s.crossed) };
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
      streak: last >= day - 1 ? num(st.count) : 0,
    };
  }

  private async epitaph(day: number, id: string, viewer: string): Promise<EpitaphDto | null> {
    const e = await this.store.hGetAll(K.ep(day, id));
    if (!e.user) return null;
    const v = await this.store.hGet(K.votes(day, viewer), id);
    const text = num(e.text);
    return {
      id,
      user: e.user,
      text: isEpitaphId(text) ? text : 0,
      step: num(e.step),
      at: num(e.at),
      honest: num(e.honest),
      liar: num(e.liar),
      myVote: v === 'honest' || v === 'liar' ? v : null,
    };
  }

  private async grave(day: number, i: number, viewer: string): Promise<GraveDto> {
    const [falls, topIds, carved, mineList] = await Promise.all([
      this.store.hGet(K.falls(day), String(i)),
      this.store.zTop(K.cell(day, i), 1),
      this.store.zCard(K.cell(day, i)),
      this.store.hGet(K.user(day, viewer), 'fellAt'),
    ]);
    const topId = topIds[0];
    return {
      i,
      falls: num(falls),
      top: topId ? await this.epitaph(day, topId, viewer) : null,
      carved,
      mine: parseList(mineList).includes(i),
    };
  }

  async init(day: number, user: string, postId: string): Promise<InitResponse> {
    const falls = await this.store.hGetAll(K.falls(day));
    const cells = Object.keys(falls).map(Number).filter(Number.isInteger);
    const [dayDto, me, graves] = await Promise.all([
      this.dayDto(day),
      this.me(day, user),
      Promise.all(cells.map((i) => this.grave(day, i, user))),
    ]);
    return { type: 'init', postId, day: dayDto, graves, me };
  }

  private async recordPath(day: number, user: string, path: Cell[]): Promise<void> {
    const board = generateBoard(day);
    const u = await this.store.hGetAll(K.user(day, user));
    const revealed = new Set(parseList(u.revealed));
    revealed.add(idx(board.start.c, board.start.r));
    for (const p of path) if (!board.pits[idx(p.c, p.r)]) revealed.add(idx(p.c, p.r));
    await this.store.hSet(K.user(day, user), { revealed: JSON.stringify([...revealed]) });
  }

  private async assertCanWalk(day: number, user: string): Promise<MeDto> {
    if (!user || user === 'anonymous') throw new GameError('Log in to walk the crossing');
    const me = await this.me(day, user);
    if (me.crossed) throw new GameError('You already crossed today');
    if (me.candles <= 0) throw new GameError('Your candles are spent for today');
    if (me.uncarved !== null) throw new GameError('Carve your last words first');
    return me;
  }

  async fall(day: number, user: string, rawPath: unknown): Promise<FallResponse> {
    const path = parsePath(rawPath);
    await this.assertCanWalk(day, user);
    const outcome = judgeRun(generateBoard(day), path);
    if (outcome.kind !== 'fell') throw new GameError('That walk did not end in a pit');
    const i = idx(outcome.at.c, outcome.at.r);
    // consume a candle atomically; concurrent requests can't overspend
    const spent = await this.store.hIncrBy(K.user(day, user), 'spent', 1);
    if (spent > CANDLES_PER_DAY) {
      await this.store.hIncrBy(K.user(day, user), 'spent', -1);
      throw new GameError('Your candles are spent for today');
    }
    const u = await this.store.hGetAll(K.user(day, user));
    const fellAt = parseList(u.fellAt);
    fellAt.push(i);
    await Promise.all([
      this.store.hSet(K.user(day, user), {
        uncarved: String(i),
        uncarvedStep: String(outcome.steps),
        fellAt: JSON.stringify(fellAt),
      }),
      this.store.hIncrBy(K.falls(day), String(i), 1),
      this.store.hIncrBy(K.stats(day), 'fallen', 1),
    ]);
    await this.recordPath(day, user, path);
    const [meDto, grave, dayDto] = await Promise.all([this.me(day, user), this.grave(day, i, user), this.dayDto(day)]);
    return { type: 'fall', me: meDto, grave, day: dayDto };
  }

  async carve(day: number, user: string, i: number, text: unknown): Promise<CarveResponse> {
    if (!isEpitaphId(text)) throw new GameError('Unknown epitaph');
    const u = await this.store.hGetAll(K.user(day, user));
    if (!u.uncarved || num(u.uncarved) !== i) throw new GameError('Nothing to carve here');
    // one epitaph per fall, even under concurrent requests
    if (!(await this.store.hSetNX(K.user(day, user), `carved:${num(u.spent)}`, '1'))) {
      throw new GameError('Your last words are already carved');
    }
    const id = String(await this.store.incrBy(K.epSeq(day), 1));
    await this.store.hSet(K.ep(day, id), {
      user,
      i: String(i),
      text: String(text),
      step: u.uncarvedStep ?? '0',
      at: String(Date.now()),
      honest: '0',
      liar: '0',
    });
    await this.store.zAdd(K.cell(day, i), id, epScore(0, 0) + Date.now() / 1e13);
    await this.store.hSet(K.user(day, user), { uncarved: '', uncarvedStep: '' });
    const [grave, me] = await Promise.all([this.grave(day, i, user), this.me(day, user)]);
    return { type: 'carve', grave, me };
  }

  async cross(day: number, user: string, rawPath: unknown): Promise<CrossResponse> {
    const path = parsePath(rawPath);
    await this.assertCanWalk(day, user);
    const outcome = judgeRun(generateBoard(day), path);
    if (outcome.kind !== 'crossed') throw new GameError('That walk did not reach the far wall');
    if (!(await this.store.hSetNX(K.user(day, user), 'crossLock', '1'))) throw new GameError('You already crossed today');
    const rank = await this.store.hIncrBy(K.stats(day), 'crossed', 1);
    await this.store.hSet(K.user(day, user), { crossed: '1', rank: String(rank), steps: String(outcome.steps) });
    await this.recordPath(day, user, path);
    // streaks only advance on today's crossing, never by replaying an old post
    if (day === dayNumber()) {
      const st = await this.store.hGetAll(K.streak(user));
      const last = num(st.last, -99);
      const count = last === day - 1 ? num(st.count) + 1 : last === day ? num(st.count) : 1;
      await this.store.hSet(K.streak(user), { last: String(day), count: String(count) });
    }
    const [me, dayDto] = await Promise.all([this.me(day, user), this.dayDto(day)]);
    return { type: 'cross', me, day: dayDto };
  }

  async vote(day: number, user: string, id: string, vote: unknown): Promise<VoteResponse> {
    if (vote !== 'honest' && vote !== 'liar') throw new GameError('Unknown vote');
    if (!user || user === 'anonymous') throw new GameError('Log in to judge the dead');
    const e = await this.store.hGetAll(K.ep(day, id));
    if (!e.user) throw new GameError('No such epitaph');
    if (e.user === user) throw new GameError("You can't judge your own last words");
    const fresh = await this.store.hSetNX(K.votes(day, user), id, vote);
    if (!fresh) throw new GameError('You already judged these words');
    const v: Vote = vote;
    const honest = v === 'honest' ? await this.store.hIncrBy(K.ep(day, id), 'honest', 1) : num(e.honest);
    const liar = v === 'liar' ? await this.store.hIncrBy(K.ep(day, id), 'liar', 1) : num(e.liar);
    const i = num(e.i);
    await this.store.zAdd(K.cell(day, i), id, epScore(honest, liar) + num(e.at) / 1e13);
    const [epitaph, grave] = await Promise.all([this.epitaph(day, id, user), this.grave(day, i, user)]);
    if (!epitaph) throw new GameError('No such epitaph');
    return { type: 'vote', epitaph, grave };
  }

  async graveDetail(day: number, user: string, i: number): Promise<GraveResponse> {
    const ids = await this.store.zTop(K.cell(day, i), 12);
    const [grave, eps] = await Promise.all([
      this.grave(day, i, user),
      Promise.all(ids.map((id) => this.epitaph(day, id, user))),
    ]);
    return { type: 'grave', grave, epitaphs: eps.filter((e): e is EpitaphDto => e !== null) };
  }
}
