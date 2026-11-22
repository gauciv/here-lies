import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { START, generateBoard, idx, isStep, type Board, type Cell } from '../../shared/board';
import type { EpitaphId } from '../../shared/epitaphs';
import type { CrossResponse, DayDto, EpitaphDto, FallResponse, GraveDto, MeDto, Vote } from '../../shared/api';
import { loadApi, type GameApi } from '../api';
import { isLit, type Phase } from '../engine/scene';

export type Card =
  | { kind: 'none' }
  | { kind: 'grave'; i: number }
  | { kind: 'carve'; i: number }
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
  details: Map<number, EpitaphDto[]>;
  toast: string | null;
  walkedThisRun: number;
};

const startIdx = idx(START.c, START.r);

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
    details: new Map(),
    toast: null,
    walkedThisRun: 0,
  });

  const toast = useCallback((msg: string) => {
    setS((p) => ({ ...p, toast: msg }));
    window.setTimeout(() => setS((p) => (p.toast === msg ? { ...p, toast: null } : p)), 2600);
  }, []);

  const putGrave = (graves: Map<number, GraveDto>, g: GraveDto) => {
    const next = new Map(graves);
    next.set(g.i, g);
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
        const card: Card = me.crossed ? { kind: 'crossed' } : me.uncarved !== null ? { kind: 'carve', i: me.uncarved } : me.candles <= 0 ? { kind: 'spent' } : { kind: 'none' };
        setS((p) => ({
          ...p,
          status: 'ready',
          board,
          day: init.day,
          me,
          graves: new Map(init.graves.map((g) => [g.i, g])),
          revealed: new Set([startIdx, ...me.revealed]),
          player: me.uncarved !== null ? { c: me.uncarved % board.cols, r: Math.floor(me.uncarved / board.cols) } : me.crossed ? { c: 3, r: 0 } : START,
          phase,
          card,
        }));
      } catch (e) {
        if (alive) setS((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : 'Could not reach the crossing' }));
      }
    })();
    return () => { alive = false; };
  }, []);

  const openGrave = useCallback(async (i: number) => {
    setS((p) => ({ ...p, card: { kind: 'grave', i } }));
    const api = apiRef.current;
    const day = s.day?.day;
    if (!api || day === undefined) return;
    try {
      const detail = await api.grave(day, i);
      setS((p) => {
        const details = new Map(p.details);
        details.set(i, detail.epitaphs);
        return { ...p, details, graves: putGrave(p.graves, detail.grave) };
      });
    } catch {
      /* the summary card still works without the list */
    }
  }, [s.day?.day]);

  const tap = useCallback((cell: Cell) => {
    const { board, phase, card, player, graves, day } = s;
    if (!board || !day || card.kind === 'carve') return;
    const i = idx(cell.c, cell.r);
    const g = graves.get(i);
    const darkLifted = phase === 'crossed' || phase === 'idle';
    const canSee = darkLifted || isLit(player, cell);
    // graves can only be read where the torch (or the dawn) shows them
    if (g && canSee && (g.carved > 0 || g.falls > 0) && !(phase === 'walking' && isStep(player, cell) && g.carved === 0)) {
      void openGrave(i);
      return;
    }
    if (card.kind !== 'none') setS((p) => ({ ...p, card: { kind: 'none' } }));
    if (phase !== 'walking') return;
    if (!isStep(player, cell)) {
      if (card.kind === 'none') toast('Step onto a stone next to you.');
      return;
    }
    const api = apiRef.current;
    if (!api) return;
    path.current = [...path.current, cell];
    const walked = [...path.current];
    if (board.pits[i]) {
      pendingFall.current = api.fall(day.day, walked);
      pendingFall.current.catch(() => undefined);
      setS((p) => ({ ...p, player: cell, phase: 'falling', walkedThisRun: p.walkedThisRun + 1 }));
      return;
    }
    const crossing = cell.r === 0;
    if (crossing) {
      pendingCross.current = api.cross(day.day, walked);
      pendingCross.current.catch(() => undefined);
    }
    setS((p) => {
      const revealed = new Set(p.revealed);
      revealed.add(i);
      return { ...p, player: cell, revealed, phase: crossing ? 'crossing' : 'walking', walkedThisRun: p.walkedThisRun + 1 };
    });
  }, [s, openGrave, toast]);

  const resetRun = (p: GameState): GameState => {
    path.current = [];
    return { ...p, player: START, phase: 'walking', card: { kind: 'none' }, walkedThisRun: 0 };
  };

  const onFallDone = useCallback(async () => {
    try {
      const res = await pendingFall.current;
      if (!res) return;
      setS((p) => ({ ...p, me: res.me, day: res.day, graves: putGrave(p.graves, res.grave), phase: 'fallen', card: { kind: 'carve', i: res.grave.i } }));
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

  const carve = useCallback(async (text: EpitaphId) => {
    const api = apiRef.current;
    const { card, day } = s;
    if (!api || !day || card.kind !== 'carve') return;
    try {
      const res = await api.carve(day.day, card.i, text);
      setS((p) => {
        const next = { ...p, me: res.me, graves: putGrave(p.graves, res.grave) };
        return res.me.candles > 0 ? resetRun(next) : { ...next, phase: 'idle', card: { kind: 'spent' } };
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The chisel slipped. Try again.');
    }
  }, [s, toast]);

  const vote = useCallback(async (id: string, v: Vote) => {
    const api = apiRef.current;
    const day = s.day;
    if (!api || !day) return;
    try {
      const res = await api.vote(day.day, id, v);
      setS((p) => {
        const details = new Map(p.details);
        const list = details.get(res.grave.i);
        if (list) details.set(res.grave.i, list.map((e) => (e.id === id ? res.epitaph : e)));
        return { ...p, details, graves: putGrave(p.graves, res.grave) };
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Your judgement was lost in the dark.');
    }
  }, [s.day, toast]);

  const closeCard = useCallback(() => {
    setS((p) => (p.card.kind === 'carve' ? p : { ...p, card: { kind: 'none' } }));
  }, []);

  const hint = useMemo(() => {
    if (s.status !== 'ready') return '';
    if (s.phase === 'falling') return 'The stone gives way…';
    if (s.phase === 'crossing') return 'The gate opens.';
    if (s.phase === 'crossed' || s.phase === 'idle') return s.graves.size ? 'The dark has lifted. Tap any grave to judge it.' : '';
    if (s.phase !== 'walking') return '';
    const seen = s.revealed.size;
    if (seen <= 1 && s.walkedThisRun === 0) return 'Tap a glowing stone to step.';
    if (seen <= 3) return 'A number counts the pits touching that stone.';
    if (s.graves.size && seen <= 6) return 'Graves mark where others fell. Tap one in your light.';
    return 'Reach the far wall.';
  }, [s.status, s.phase, s.revealed.size, s.walkedThisRun, s.graves.size]);

  return { s, tap, onFallDone, onCrossDone, carve, vote, closeCard, openGrave, hint };
};
