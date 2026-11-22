import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Cell } from '../../shared/board';
import { SCENE_H, SCENE_W, Scene, TILE, TOP, type SceneState } from '../engine/scene';

type Props = {
  scene: SceneState | null;
  onTap: (cell: Cell) => void;
  onFallDone: () => void;
  onCrossDone: () => void;
  onSoulGone?: () => void;
  onExitDone?: () => void;
  /** keep this row in view beside the docked card (your ghost while you carve or mourn) */
  focusRow?: number | null;
  children?: ReactNode;
};

/** Integer-scaled pixel canvas that fills the space it is given. */
export const Stage = ({ scene, onTap, onFallDone, onCrossDone, onSoulGone, onExitDone, focusRow = null, children }: Props) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Scene | null>(null);
  const handlers = useRef({ onFallDone, onCrossDone, onSoulGone, onExitDone });
  useEffect(() => {
    handlers.current = { onFallDone, onCrossDone, onSoulGone, onExitDone };
  }, [onFallDone, onCrossDone, onSoulGone, onExitDone]);
  const [scale, setScale] = useState(3);
  const [pan, setPan] = useState(0);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const sc = new Scene(canvas.current, {
      onFallDone: () => handlers.current.onFallDone(),
      onCrossDone: () => handlers.current.onCrossDone(),
      onSoulGone: () => handlers.current.onSoulGone?.(),
      onExitDone: () => handlers.current.onExitDone?.(),
    });
    engine.current = sc;
    sc.start();
    return () => sc.stop();
  }, []);

  useEffect(() => {
    if (scene) engine.current?.setState(scene);
  }, [scene]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => {
      const k = Math.floor(Math.min(el.clientWidth / SCENE_W, el.clientHeight / SCENE_H));
      setScale(Math.max(1, k));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // a docked card can cover the ghost on a small screen: slide the board so the
  // ghost's row (and a stone either side) sits in the part the card leaves open
  useLayoutEffect(() => {
    const el = wrap.current, fr = frame.current;
    if (!el || !fr || focusRow === null) { setPan(0); return; }
    const measure = () => {
      const card = el.querySelector<HTMLElement>('.card-layer > *');
      const stage = el.getBoundingClientRect();
      const frameTop = (stage.height - SCENE_H * scale) / 2; // the frame is centred
      const rowMid = frameTop + (TOP + (focusRow + 0.5) * TILE) * scale;
      const reach = 1.6 * TILE * scale;
      let lo = 0, hi = stage.height;
      if (card) {
        const r = card.getBoundingClientRect();
        if (r.top - stage.top < stage.height / 2) lo = r.bottom - stage.top + 4;
        else hi = r.top - stage.top - 4;
      }
      let shift = 0;
      if (rowMid - reach < lo) shift = lo - (rowMid - reach);
      else if (rowMid + reach > hi) shift = hi - (rowMid + reach);
      setPan(Math.round(shift));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const card = el.querySelector('.card-layer > *');
    if (card) ro.observe(card);
    return () => ro.disconnect();
  }, [focusRow, scale, children]);

  return (
    <div ref={wrap} className="stage">
      <div ref={frame} className="stage-frame" style={{ width: SCENE_W * scale, height: SCENE_H * scale, translate: `0 ${pan}px` }}>
        <canvas
          ref={canvas}
          className="scene"
          style={{ width: SCENE_W * scale, height: SCENE_H * scale }}
          role="img"
          aria-label="The crossing: a grid of dark stones. Tap a stone next to the dwarf to step onto it."
          onPointerDown={(e) => {
            const cell = engine.current?.tileAt(e.clientX, e.clientY);
            if (cell) onTap(cell);
          }}
        />
      </div>
      {children}
    </div>
  );
};
