import { useEffect, useRef, useState } from 'react';
import { CANDLES_PER_DAY } from '../../shared/board';
import { sound } from '../engine/sound';
import { PixelIcon } from './PixelIcon';
import { CANDLE_DYING, CANDLE_LEGEND, CANDLE_LIT, CANDLE_OUT, CANDLE_OUT_LEGEND } from './icons';

const DYING_FRAME_MS = 160;
const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The day's candles. When one is lost it gutters out and smokes, with a hiss. */
export const Candles = ({ lit }: { lit: number }) => {
  const [tick, setTick] = useState(0);
  const [dying, setDying] = useState<{ index: number; frame: number } | null>(null);
  const prev = useRef(lit);

  // flicker
  useEffect(() => {
    if (reducedMotion()) return;
    const t = window.setInterval(() => setTick((k) => k + 1), 260);
    return () => window.clearInterval(t);
  }, []);

  // a candle was just lost: play its last moments
  useEffect(() => {
    if (lit < prev.current) {
      const index = lit;
      sound.play('snuff');
      if (reducedMotion()) {
        prev.current = lit;
        return;
      }
      let frame = -1;
      const step = () => {
        frame += 1;
        if (frame >= CANDLE_DYING.length) {
          window.clearInterval(t);
          setDying(null);
        } else setDying({ index, frame });
      };
      const first = window.setTimeout(step, 0);
      const t = window.setInterval(step, DYING_FRAME_MS);
      prev.current = lit;
      return () => { window.clearTimeout(first); window.clearInterval(t); };
    }
    prev.current = lit;
  }, [lit]);

  return (
    <div className="candles" role="img" aria-label={`${lit} of ${CANDLES_PER_DAY} candles left`}>
      {Array.from({ length: CANDLES_PER_DAY }, (_, k) => {
        if (dying && dying.index === k) {
          return <PixelIcon key={k} rows={CANDLE_DYING[dying.frame] ?? CANDLE_OUT} legend={CANDLE_LEGEND} size={2} />;
        }
        if (k < lit) return <PixelIcon key={k} rows={CANDLE_LIT[(tick + k) % 2] ?? CANDLE_OUT} legend={CANDLE_LEGEND} size={2} />;
        return <PixelIcon key={k} rows={CANDLE_OUT} legend={CANDLE_OUT_LEGEND} size={2} />;
      })}
    </div>
  );
};
