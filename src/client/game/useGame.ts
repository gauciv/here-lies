import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { START, cellOf, generateBoard, idx, isStep, type Board, type Cell } from '../../shared/board';
import { CRUMBLE_AFTER, directionBetween, validDirections, type Direction } from '../../shared/epitaphs';
import type { CrossResponse, DayDto, FallResponse, GraveDto, MeDto } from '../../shared/api';
import { loadApi, type GameApi } from '../api';
import { isLit, type Phase } from '../engine/scene';
import { sound } from '../engine/sound';

export type Card =
  | { kind: 'none' }
  | { kind: 'intro' }
  | { kind: 'grave'; i: number }
  | { kind: 'carve'; i: number }
  | { kind: 'fellAgain'; reason: 'carvedToday' | 'stoneTaken' }
  | { kind: 'crossed' }
  | { kind: 'spent' };

export type GameState = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  board: Board | null;
  day: DayDto | null;
  me: MeDto | null;
  graves: Map<number, GraveDto>;
  revealed: Set<number>;
  player: Cell;
  phase: Phase;
  card: Card;
  toast: string | null;
  walkedThisRun: number;
  /** the arrow being considered while carving (not yet confirmed) */
  carveDir: Direction | null;
};

const startIdx = idx(START.c, START.r);
const INTRO_KEY = 'herelies:intro-seen';

const introSeen = (): boolean => {
  try {
    return window.localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
};

const markIntroSeen = (): void => {
  try {
    window.localStorage.setItem(INTRO_KEY, '1');
  } catch {
    /* a per-viewer convenience only */
  }
};

export const useGame = () => {
  const apiRef = useRef<GameApi | null>(null);
  const path = useRef<Cell[]>([]);
  const pendingFall = useRef<Promise<FallResponse> | null>(null);
  const pendingCross = useRef<Promise<CrossResponse> | null>(null);
  const [s, setS] = useState<GameState>({
    status: 'loading',
    error: null,
    board: null,
    day: null,
    me: null,
    graves: new Map(),
    revealed: new Set([startIdx]),
    player: START,
    phase: 'idle',
    card: { kind: 'none' },
    toast: null,
    walkedThisRun: 0,
    carveDir: null,
  });

  const toast = useCallback((msg: string) => {
    setS((p) => ({ ...p, toast: msg }));
    window.setTimeout(() => setS((p) => (p.toast === msg ? { ...p, toast: null } : p)), 2600);
  }, []);

  /** Only slabs that carry an arrow are on the board; blank ones stay hidden. */
  const putGrave = (graves: Map<number, GraveDto>, g: GraveDto) => {
    const next = new Map(graves);
    if (g.top) next.set(g.i, g);
    else next.delete(g.i);
    return next;
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const api = await loadApi();
        apiRef.current = api;
        const init = await api.init();
        if (!alive) return;
        const board = generateBoard(init.day.day);
        const me = init.me;
        const phase: Phase = me.crossed ? 'crossed' : me.uncarved !== null ? 'fallen' : me.candles <= 0 ? 'idle' : 'walking';
        const card: Card = me.crossed ? { kind: 'crossed' } : me.uncarved !== null ? { kind: 'carve', i: me.uncarved } : me.candles <= 0 ? { kind: 'spent' } : introSeen() ? { kind: 'none' } : { kind: 'intro' };
        setS((p) => ({
          ...p,
          status: 'ready',
          board,
          day: init.day,
          me,
          graves: new Map(init.graves.map((g) => [g.i, g])),
          revealed: new Set([startIdx, ...me.revealed]),
          // mid-carve on reload: stand in the pit you fell into, so the true direction is known
          // mid-carve on reload: the ghost stands on its slab
          player: me.uncarved !== null ? cellOf(me.uncarved) : me.crossed ? { c: 3, r: 0 } : START,
          phase,
          card,
        }));
      } catch (e) {
        if (alive) setS((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : 'Could not reach the crossing' }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const openGrave = useCallback((i: number) => {
    setS((p) => ({ ...p, card: { kind: 'grave', i } }));
  }, []);

  const tap = useCallback((cell: Cell) => {
    const { board, phase, card, player, graves, day } = s;
    if (!board || !day) return;
    // carving: tapping a stone next to your slab aims the arrow at it
    if (card.kind === 'carve') {
      const d = directionBetween(cellOf(card.i), cell);
      if (d !== null && validDirections(cellOf(card.i)).includes(d)) setS((p) => ({ ...p, carveDir: d }));
      return;
    }
    const i = idx(cell.c, cell.r);
    const g = graves.get(i);
    const darkLifted = phase === 'crossed' || phase === 'idle';
    if (card.kind === 'intro') markIntroSeen();
    if (card.kind !== 'none') setS((p) => ({ ...p, card: { kind: 'none' } }));
    sound.startAmbience();
    if (phase === 'walking' && isStep(player, cell)) {
      if (s.me?.fellInto.includes(i)) {
        sound.play('deny');
        toast('You already fell there.');
        return;
      }
      // fall through to the step below; slabs are walkable
    } else {
      // graves can only be read where the torch (or the dawn) shows them
      if (g && (darkLifted || isLit(player, cell))) { openGrave(i); return; }
      if (phase === 'walking' && card.kind === 'none') { sound.play('deny'); toast('Step onto a stone next to you.'); }
      return;
    }
    const api = apiRef.current;
    if (!api) return;
    const alreadyStoodHere = path.current.some((p) => p.c === cell.c && p.r === cell.r);
    path.current = [...path.current, cell];
    const walked = [...path.current];
    if (board.pits[i]) {
      sound.play('fall');
      sound.hush(6000);
      pendingFall.current = api.fall(day.day, walked);
      pendingFall.current.catch(() => undefined);
      setS((p) => ({ ...p, player: cell, phase: 'falling', walkedThisRun: p.walkedThisRun + 1 }));
      return;
    }
    const crossing = cell.r === 0;
    sound.play(crossing ? 'cross' : 'step');
    if (crossing) {
      pendingCross.current = api.cross(day.day, walked);
      pendingCross.current.catch(() => undefined);
    }
    setS((p) => {
      const revealed = new Set(p.revealed);
      revealed.add(i);
      return { ...p, player: cell, revealed, phase: crossing ? 'crossing' : 'walking', walkedThisRun: p.walkedThisRun + 1 };
    });
    // stepping onto someone else's slab wears it; the fifth walker breaks it
    if (g && g.top && !crossing && !alreadyStoodHere && g.top.user !== s.me?.username) {
      const visits = g.top.visits + 1;
      if (visits >= CRUMBLE_AFTER) {
        window.setTimeout(() => {
          sound.play('crumble');
          toast('The slab crumbles to dust.');
          setS((p) => {
            const graves = new Map(p.graves);
            graves.delete(i);
            return { ...p, graves, card: p.card.kind === 'grave' && p.card.i === i ? { kind: 'none' } : p.card };
          });
        }, 220);
        return;
      }
      const worn: GraveDto = { ...g, top: { ...g.top, visits } };
      setS((p) => ({ ...p, graves: putGrave(p.graves, worn) }));
    }
    // stepping onto a slab reads it
    if (g && !crossing && g.top) window.setTimeout(() => openGrave(i), 200);
  }, [s, openGrave, toast]);

  const resetRun = (p: GameState): GameState => {
    path.current = [];
    return { ...p, player: START, phase: 'walking', card: { kind: 'none' }, walkedThisRun: 0, carveDir: null };
  };

  const onFallDone = useCallback(async () => {
    try {
      const res = await pendingFall.current;
      if (!res) return;
      // carve only if this is your first carving today on a stone nobody has claimed
      const card: Card = res.me.uncarved !== null
        ? { kind: 'carve', i: res.grave.i }
        : res.me.candles <= 0
          ? { kind: 'spent' }
          : { kind: 'fellAgain', reason: res.me.myArrow ? 'carvedToday' : 'stoneTaken' };
      const phase: Phase = res.me.uncarved === null && res.me.candles <= 0 ? 'idle' : 'fallen';
      // when carving, the ghost floats back to the slab it fell from
      setS((p) => ({ ...p, me: res.me, day: res.day, graves: putGrave(p.graves, res.grave), phase, card, carveDir: null, player: card.kind === 'carve' ? cellOf(res.grave.i) : p.player }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The dark swallowed that step.');
      setS((p) => resetRun(p));
    }
  }, [toast]);

  const onCrossDone = useCallback(async () => {
    try {
      const res = await pendingCross.current;
      if (!res) return;
      setS((p) => ({ ...p, me: res.me, day: res.day, phase: 'crossed', card: { kind: 'crossed' } }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The gate would not open.');
      setS((p) => resetRun(p));
    }
  }, [toast]);

  const carve = useCallback(async (arrow: Direction) => {
    const api = apiRef.current;
    const { card, day } = s;
    if (!api || !day || card.kind !== 'carve') return;
    try {
      sound.play('carve');
      const res = await api.carve(day.day, card.i, arrow);
      setS((p) => {
        const next = { ...p, me: res.me, graves: putGrave(p.graves, res.grave) };
        return res.me.candles > 0 ? resetRun(next) : { ...next, phase: 'idle', card: { kind: 'spent' } };
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The chisel slipped. Try again.');
    }
  }, [s, toast]);

  const selectArrow = useCallback((d: Direction) => {
    setS((p) => (p.card.kind === 'carve' ? { ...p, carveDir: d } : p));
  }, []);

  const skip = useCallback(async () => {
    const api = apiRef.current;
    const { card, day } = s;
    if (!api || !day || card.kind !== 'carve') return;
    try {
      const res = await api.skip(day.day, card.i);
      setS((p) => resetRun({ ...p, me: res.me }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not skip.');
    }
  }, [s, toast]);

  const share = useCallback(async (): Promise<boolean> => {
    const api = apiRef.current;
    const day = s.day;
    if (!api || !day) return false;
    try {
      const res = await api.share(day.day);
      setS((p) => ({ ...p, me: res.me }));
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not post your comment.');
      return false;
    }
  }, [s.day, toast]);

  const join = useCallback(async (): Promise<boolean> => {
    const api = apiRef.current;
    if (!api) return false;
    try {
      await api.join();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not join right now.');
      return false;
    }
  }, [toast]);

  const flair = useCallback(async (): Promise<boolean> => {
    const api = apiRef.current;
    const day = s.day;
    if (!api || !day) return false;
    try {
      await api.flair(day.day);
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not set your flair.');
      return false;
    }
  }, [s.day, toast]);

  const closeCard = useCallback(() => {
    setS((p) => (p.card.kind === 'carve' ? p : { ...p, card: { kind: 'none' } }));
  }, []);

  const hint = useMemo(() => {
    if (s.status !== 'ready') return '';
    if (s.phase === 'falling') return 'The stone gives way…';
    if (s.phase === 'crossing') return 'The gate opens.';
    if (s.phase === 'crossed' || s.phase === 'idle') return s.graves.size ? 'The dark has lifted. Tap a slab to see if its arrow lied.' : '';
    if (s.phase !== 'walking') return '';
    const seen = s.revealed.size;
    if (seen <= 1 && s.walkedThisRun === 0) return 'Reach the light under the far door. Tap a glowing stone to step.';
    if (seen <= 3) return 'A number counts the pits touching that stone.';
    if (s.graves.size && seen <= 6) return 'A slab marks where someone stood before they fell. Its arrow may lie.';
    return 'Reach the far wall.';
  }, [s.status, s.phase, s.revealed.size, s.walkedThisRun, s.graves.size]);

  const startPlaying = useCallback(() => {
    markIntroSeen();
    setS((p) => (p.card.kind === 'intro' ? { ...p, card: { kind: 'none' } } : p));
  }, []);

  const openHelp = useCallback(() => {
    setS((p) => (p.card.kind === 'carve' ? p : { ...p, card: { kind: 'intro' } }));
  }, []);

  const walkAgain = useCallback(() => {
    setS((p) => (p.card.kind === 'fellAgain' ? resetRun(p) : p));
  }, []);

  return { s, tap, onFallDone, onCrossDone, carve, selectArrow, skip, share, join, flair, walkAgain, startPlaying, openHelp, closeCard, hint };
};
