import { useEffect, useRef, useState } from 'react';
import { sound } from '../engine/sound';
import { PANELS, PANEL_H, PANEL_W, loadAtlas } from './panels';

/** One panel: a little pixel scene drawn live, with its caption and sound-effect lettering. */
const Panel = ({ index, shown }: { index: number; shown: boolean }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const panel = PANELS[index]!;
  useEffect(() => {
    const canvas = ref.current;
    const x = canvas?.getContext('2d');
    if (!canvas || !x || !shown) return;
    x.imageSmoothingEnabled = false;
    let raf = 0;
    let alive = true;
    void loadAtlas().then((img) => {
      const loop = (now: number) => {
        if (!alive) return;
        x.fillStyle = '#06070b';
        x.fillRect(0, 0, PANEL_W, PANEL_H);
        panel.draw(x, img, now / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [panel, shown]);
  return (
    <figure className={`comic-panel comic-panel-${index}${shown ? ' is-shown' : ''}`} aria-hidden={!shown}>
      <canvas ref={ref} width={PANEL_W} height={PANEL_H} />
      <figcaption className="comic-caption">{panel.caption}</figcaption>
      {panel.sfx && <span className={`comic-sfx comic-sfx-${panel.sfx.tone}`}>{panel.sfx.text}</span>}
    </figure>
  );
};

/**
 * A short comic for first-time players: four panels pop in one at a time, a
 * tap each. Skippable, and replayable from the camp's settings.
 */
export const Comic = ({ onDone }: { onDone: () => void }) => {
  const [shown, setShown] = useState(1);
  const last = shown >= PANELS.length;
  const next = () => {
    sound.play(last ? 'door' : 'step');
    if (last) onDone();
    else setShown((n) => n + 1);
  };
  return (
    <div className="comic" role="dialog" aria-modal="true" aria-label="How it began" onClick={next}>
      <button className="comic-skip" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip</button>
      <div className="comic-page">
        {PANELS.map((_, i) => <Panel key={i} index={i} shown={i < shown} />)}
      </div>
      <p className="comic-tap">{last ? 'Tap to begin' : 'Tap'}</p>
    </div>
  );
};
