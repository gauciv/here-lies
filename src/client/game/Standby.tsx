import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { CANDLES_PER_DAY, dayStartUtc, difficultyOf } from '../../shared/board';
import type { DayDto, MeDto } from '../../shared/api';
import { pioneerTitle } from '../../shared/pioneer';
import { CAMP_H, CAMP_W, CampScene } from '../engine/camp';
import { dateLabel } from './format';

export type StandbyHandle = { enter: (onDone: () => void) => void };

const useCountdown = (day: number): string => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = Math.max(0, dayStartUtc(day + 1) - now);
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000).toString().padStart(2, '0')}m`;
};

/** The resting room, scaled to whole pixels so the art stays crisp. */
const CampCanvas = forwardRef<StandbyHandle, { maxScale?: number }>(({ maxScale = 4 }, ref) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CampScene | null>(null);
  const [scale, setScale] = useState(3);

  useEffect(() => {
    if (!canvas.current) return;
    const s = new CampScene(canvas.current);
    scene.current = s;
    s.start();
    return () => s.stop();
  }, []);

  useImperativeHandle(ref, () => ({ enter: (onDone) => scene.current?.enter(onDone) ?? onDone() }), []);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.max(1, Math.min(maxScale, Math.floor(Math.min(el.clientWidth / CAMP_W, el.clientHeight / CAMP_H)))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);

  return (
    <div ref={wrap} className="camp-stage">
      <canvas ref={canvas} className="scene" style={{ width: CAMP_W * scale, height: CAMP_H * scale }} role="img"
        aria-label="An adventurer rests by a campfire in a small dungeon room. A door leads to the crossing." />
    </div>
  );
});
CampCanvas.displayName = 'CampCanvas';

const status = (me: MeDto): string => {
  if (me.crossed) return me.pioneer !== null ? `You crossed today · ${pioneerTitle(me.pioneer)}, ${me.pioneer}%` : 'You crossed today.';
  if (me.candles <= 0) return 'Your candles are spent for today.';
  if (me.uncarved !== null) return 'Your ghost waits to carve its arrow.';
  if (me.candles < CANDLES_PER_DAY) return `You have ${me.candles} of ${CANDLES_PER_DAY} candles left.`;
  return 'The door is waiting. Three candles, one crossing.';
};

/** The standby screen: a quiet room and a parchment that keeps your record. */
export const Standby = forwardRef<StandbyHandle, {
  day: DayDto | null; me: MeDto | null; busy: boolean; onEnter: (e: MouseEvent) => void; onReview: (e: MouseEvent) => void; compact?: boolean;
}>(({ day, me, busy, onEnter, onReview, compact = false }, ref) => {
  const countdown = useCountdown(day?.day ?? 1);
  const finished = !!me && (me.crossed || me.candles <= 0) && me.uncarved === null;
  const diff = day ? difficultyOf(day.day) : null;
  const tier = diff?.name ?? '';
  return (
    <div className={`standby${compact ? ' standby-compact' : ''}`}>
      <CampCanvas ref={ref} maxScale={compact ? 3 : 4} />
      <section className="parchment" aria-label="Your record">
        <p className="parch-title">Here Lies</p>
        {day && (
          <>
            <p className="parch-line">Day {day.day} · {dateLabel(day.day)}</p>
            <p className="parch-room">{day.room}</p>
            <p className="parch-line">
              <b className={`parch-tier parch-${tier.toLowerCase()}`}>{tier}</b>{diff ? ` · ${diff.hint}` : ''}
            </p>
          </>
        )}
        {me && (
          <p className="parch-streak">
            {me.streak > 0 ? (
              <><span className="parch-big">{me.streak}</span> day streak{me.bestStreak > me.streak ? ` · best ${me.bestStreak}` : ''}</>
            ) : me.bestStreak > 0 ? (
              <>Streak broken · best {me.bestStreak}. Cross today to start anew.</>
            ) : (
              <>No streak yet. Cross today to begin one.</>
            )}
          </p>
        )}
        {day && <p className="parch-line">Today {day.fallen} fell · {day.crossed} crossed</p>}
        {me && <p className="parch-status">{status(me)}</p>}
        <div className="parch-actions">
          {finished ? (
            <>
              <button className="btn btn-share" onClick={onReview}>Review the room</button>
              <span className="parch-note">New room in {countdown}</span>
            </>
          ) : (
            <button className="btn btn-share btn-enter" disabled={busy || !me} onClick={onEnter}>Enter the dungeon</button>
          )}
        </div>
      </section>
    </div>
  );
});
Standby.displayName = 'Standby';
