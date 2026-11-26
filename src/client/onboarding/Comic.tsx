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
    <figure className={`comic-panel${shown ? ' is-shown' : ''}`} aria-hidden={!shown}>
      <figcaption className="comic-caption">{panel.caption}</figcaption>
      <div className={`comic-art comic-art-${index % 4}`}>
        <canvas ref={ref} width={PANEL_W} height={PANEL_H} />
        {panel.sfx && <span className={`comic-sfx comic-sfx-${panel.sfx.tone}`}>{panel.sfx.text}</span>}
      </div>
    </figure>
  );
};

/** Two pages, so every panel is big enough to read on a phone. */
const PAGES: readonly (readonly number[])[] = [[0, 1, 2], [3, 4]];

/**
 * The story of Brom and his lost brother Kett, for first-time players: panels
 * pop in one tap at a time, then the page turns. Skippable, and replayable
 * from the camp's settings.
 */
export const Comic = ({ onDone }: { onDone: () => void }) => {
  const [page, setPage] = useState(0);
  const [shown, setShown] = useState(1);
  const [turning, setTurning] = useState(false);
  const panels = PAGES[page] ?? [];
  const pageDone = shown >= panels.length;
  const last = pageDone && page === PAGES.length - 1;
  const next = () => {
    if (turning) return;
    sound.play(last ? 'door' : 'step');
    if (last) { onDone(); return; }
    if (!pageDone) { setShown((n) => n + 1); return; }
    // turn the page
    setTurning(true);
    window.setTimeout(() => { setPage((p) => p + 1); setShown(1); setTurning(false); }, 260);
  };
  return (
    <div className="comic" role="dialog" aria-modal="true" aria-label="How it began" onClick={next}>
      <button className="comic-skip" onClick={(e) => { e.stopPropagation(); onDone(); }}>Skip</button>
      <div className={`comic-page${turning ? ' is-turning' : ''}`} key={page}>
        {panels.map((index, i) => <Panel key={index} index={index} shown={i < shown} />)}
      </div>
      <p className="comic-tap">{last ? 'Tap to begin' : pageDone ? 'Tap to turn the page' : 'Tap'}</p>
    </div>
  );
};
