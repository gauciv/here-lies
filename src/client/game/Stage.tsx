import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Cell } from '../../shared/board';
import { SCENE_H, SCENE_W, Scene, type SceneState } from '../engine/scene';

type Props = {
  scene: SceneState | null;
  onTap: (cell: Cell) => void;
  onFallDone: () => void;
  onCrossDone: () => void;
  children?: ReactNode;
};

/** Integer-scaled pixel canvas that fills the space it is given. */
export const Stage = ({ scene, onTap, onFallDone, onCrossDone, children }: Props) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Scene | null>(null);
  const handlers = useRef({ onFallDone, onCrossDone });
  useEffect(() => {
    handlers.current = { onFallDone, onCrossDone };
  }, [onFallDone, onCrossDone]);
  const [scale, setScale] = useState(3);

  useEffect(() => {
    if (!canvas.current) return;
    const sc = new Scene(canvas.current, {
      onFallDone: () => handlers.current.onFallDone(),
      onCrossDone: () => handlers.current.onCrossDone(),
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

  return (
    <div ref={wrap} className="stage">
      <div className="stage-frame" style={{ width: SCENE_W * scale, height: SCENE_H * scale }}>
        <canvas
          ref={canvas}
          className="scene"
          style={{ width: SCENE_W * scale, height: SCENE_H * scale }}
          role="img"
          aria-label="The crossing: a grid of dark stones. Tap a stone next to your lantern to step onto it."
          onPointerDown={(e) => {
            const cell = engine.current?.tileAt(e.clientX, e.clientY);
            if (cell) onTap(cell);
          }}
        />
        {children}
      </div>
    </div>
  );
};
