import './index.css';

import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import { START, dayNumber, difficultyOf, generateBoard, idx } from '../shared/board';
import type { InitResponse } from '../shared/api';
import { loadApi } from './api';
import { dateLabel } from './game/format';
import { SCENE_W, Scene, TILE, TOP, type GraveView, type SceneState } from './engine/scene';

const isLocalPreview = () => ['localhost', '127.0.0.1'].includes(window.location.hostname);

const open = (e: MouseEvent | PointerEvent) => {
  if (isLocalPreview()) {
    window.location.assign('game.html'); // no Reddit host locally
    return;
  }
  try {
    requestExpandedMode(e.nativeEvent, 'game');
  } catch (err) {
    console.error('could not open the game', err);
  }
};

/** Where the torchlight sits in scene pixels: just above the entry stone. */
const LIT_Y = TOP + START.r * TILE - 6;

/** A close-up "camera" on the dwarf at the stairs, framed for a feed post. */
const SplashScene = ({ scene }: { scene: SceneState }) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Scene | null>(null);
  const [frame, setFrame] = useState({ k: 4, left: 0, top: 0 });

  useEffect(() => {
    if (!canvas.current) return;
    const sc = new Scene(canvas.current);
    engine.current = sc;
    sc.start();
    return () => sc.stop();
  }, []);

  useEffect(() => { engine.current?.setState(scene); }, [scene]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const w = el.clientWidth, h = el.clientHeight;
      const k = Math.max(3, Math.min(5, Math.round(h / 128)));
      setFrame({ k, left: Math.round((w - SCENE_W * k) / 2), top: Math.round(h * 0.7 - LIT_Y * k) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="splash-cam">
      <canvas
        ref={canvas}
        className="scene"
        style={{ position: 'absolute', left: frame.left, top: frame.top, width: SCENE_W * frame.k }}
        aria-hidden="true"
      />
    </div>
  );
};

export const Splash = () => {
  const [init, setInit] = useState<InitResponse | null>(null);
  const day = init?.day.day ?? dayNumber();
  const diff = difficultyOf(day);

  useEffect(() => {
    let alive = true;
    void loadApi()
      .then((api) => api.init())
      .then((res) => { if (alive) setInit(res); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const scene = useMemo<SceneState>(() => {
    const graves = new Map<number, GraveView>();
    init?.graves.forEach((g) => {
      graves.set(g.i, { falls: g.falls, honest: g.top?.honest ?? 0, liar: g.top?.liar ?? 0, carved: g.carved > 0, mine: g.mine });
    });
    return {
      board: generateBoard(day),
      revealed: new Set([idx(START.c, START.r)]),
      player: START,
      graves,
      phase: 'walking',
      revealAll: false,
    };
  }, [day, init]);

  const me = init?.me;
  const cta = me?.crossed ? "See today's graves" : me && me.candles <= 0 ? 'Judge the dead' : 'Enter the dungeon';

  return (
    <main className="splash" onClick={open}>
      <SplashScene scene={scene} />
      <div className="splash-over">
        <header className="splash-head">
          <h1 className="logo logo-xl">Here Lies</h1>
          <p className="hud-sub">
            Day {day} · {dateLabel(day)} · <b className={`tier tier-${diff.name.toLowerCase()}`}>{diff.name}</b>
          </p>
          {init && (
            <p className="hud-sub">
              <b className="num-fallen">{init.day.fallen}</b> fell today · <b className="num-crossed">{init.day.crossed}</b> crossed
            </p>
          )}
          <p className="splash-hook">Every grave holds last words.<br />Some of them lie.</p>
        </header>
        <button className="btn btn-cta" onClick={(e) => { e.stopPropagation(); open(e); }}>
          {cta}
        </button>
      </div>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
