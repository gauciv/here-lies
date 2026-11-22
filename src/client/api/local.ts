// Local preview backend: the real Engine over an in-memory store, seeded with
// simulated wanderers so the board looks like a busy day. Used on localhost only.
import { CANDLES_PER_DAY, START, cellOf, dayNumber, generateBoard, idx, mulberry32, neighbors, type Cell } from '../../shared/board';
import { directionBetween, validDirections } from '../../shared/epitaphs';
import { Engine } from '../../shared/engine';
import { MemoryStore } from '../../shared/memoryStore';
import type { GameApi } from './types';

const ME = 'you';
const GHOSTS = [
  'morrow_fen', 'quietcartographer', 'elk_and_ember', 'tallowwick', 'bramble_owl', 'saltmarsh_sam',
  'nightjar_77', 'grey_lantern',
];

const store = new MemoryStore();
const engine = new Engine(store);
const day = dayNumber();
const board = generateBoard(day);

const seed = async () => {
  const rand = mulberry32(day * 101 + 5);
  for (const ghost of GHOSTS) {
    for (let life = 0; life < CANDLES_PER_DAY; life++) {
      const path: Cell[] = [];
      let at: Cell = START;
      let outcome: 'fell' | 'crossed' | null = null;
      for (let step = 0; step < 24 && !outcome; step++) {
        const options = neighbors(at.c, at.r).filter((n) => !path.some((p) => p.c === n.c && p.r === n.r));
        if (!options.length) break;
        // wander mostly upward, a little sideways
        options.sort((a, b) => a.r - b.r + (rand() - 0.5) * 2.2);
        const next = options[0]!;
        path.push(next);
        at = next;
        if (board.pits[idx(next.c, next.r)]) outcome = 'fell';
        else if (next.r === 0) outcome = 'crossed';
      }
      if (outcome === 'crossed') { await engine.cross(day, ghost, path); break; }
      if (outcome !== 'fell') break;
      const fell = await engine.fall(day, ghost, path);
      // most simulated players point honestly at the pit; some lie
      const stone = cellOf(fell.grave.i);
      const truth = directionBetween(stone, at) ?? 0;
      const options = validDirections(stone).filter((d) => d !== truth);
      const arrow = rand() < 0.65 || !options.length ? truth : options[Math.floor(rand() * options.length)]!;
      if (fell.me.uncarved !== null) await engine.carve(day, ghost, fell.grave.i, arrow);
    }
  }
};

const ready = seed();
const wait = <T>(p: Promise<T>): Promise<T> => ready.then(() => new Promise((res) => setTimeout(res, 80))).then(() => p);

export const localApi: GameApi = {
  init: () => wait(Promise.resolve()).then(() => engine.init(day, ME, 't3_local')),
  fall: (d, path) => wait(Promise.resolve()).then(() => engine.fall(d, ME, path)),
  cross: (d, path) => wait(Promise.resolve()).then(() => engine.cross(d, ME, path)),
  carve: (d, i, arrow) => wait(Promise.resolve()).then(() => engine.carve(d, ME, i, arrow)),
  share: (d) =>
    wait(Promise.resolve())
      .then(() => engine.claimShare(d, ME))
      .then((text) => { console.info('[local preview] would comment:\n' + text); return engine.confirmShare(d, ME, true); })
      .then((me) => ({ type: 'share' as const, me })),
  join: () => wait(Promise.resolve()).then(() => ({ type: 'join' as const })),
  flair: (d) => wait(Promise.resolve()).then(() => engine.flairFor(d, ME)).then((f) => ({ type: 'flair' as const, text: f.text })),
};
