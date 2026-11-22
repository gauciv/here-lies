import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { CANDLES_PER_DAY, dayStartUtc, difficultyOf } from '../../shared/board';
import type { DayDto, MeDto } from '../../shared/api';
import { pioneerTitle } from '../../shared/pioneer';
import { CAMP_H, CAMP_W, CampScene, type CampCue } from '../engine/camp';
import { dateLabel } from './format';

export type StandbyHandle = { enter: (onDone: () => void, onCue?: (cue: CampCue) => void) => void };

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

  useImperativeHandle(ref, () => ({
    enter: (onDone, onCue) => { if (scene.current) scene.current.enter(onDone, onCue); else onDone(); },
  }), []);

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
        aria-label="A dwarf rests by a campfire in the dark. Somewhere beyond the light is a door." />
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

/** Your record, kept on a parchment you open when you want it. */
const Record = ({ day, me, finished, onHide }: { day: DayDto | null; me: MeDto | null; finished: boolean; onHide: () => void }) => {
  const countdown = useCountdown(day?.day ?? 1);
  const diff = day ? difficultyOf(day.day) : null;
  const tier = diff?.name ?? '';
  return (
    <section className="parchment" id="camp-record" aria-label="Your record">
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
      {finished && <p className="parch-note">New room in {countdown}</p>}
      <button className="btn btn-hide" onClick={onHide}>Hide</button>
    </section>
  );
};

/**
 * The standby screen: the title, a dwarf by a fire in the dark, and one way on.
 * Your record stays folded away until you ask for it.
 */
export const Standby = forwardRef<StandbyHandle, {
  day: DayDto | null; me: MeDto | null; busy: boolean; onEnter: (e: MouseEvent) => void; onReview: (e: MouseEvent) => void; compact?: boolean;
}>(({ day, me, busy, onEnter, onReview, compact = false }, ref) => {
  const [open, setOpen] = useState(false);
  const finished = !!me && (me.crossed || me.candles <= 0) && me.uncarved === null;
  return (
    <div className={`standby${compact ? ' standby-compact' : ''}`}>
      <h1 className="camp-title">Here Lies</h1>
      <div className="camp-middle">
        <CampCanvas ref={ref} maxScale={compact ? 3 : 4} />
        {open && <Record day={day} me={me} finished={finished} onHide={() => setOpen(false)} />}
      </div>
      <div className="camp-actions">
        {finished ? (
          <button className="btn btn-share btn-enter" onClick={onReview}>Review the room</button>
        ) : (
          <button className="btn btn-share btn-enter" disabled={busy || !me} onClick={onEnter}>Enter the dungeon</button>
        )}
        <button className="btn btn-record" aria-expanded={open} aria-controls="camp-record" onClick={() => setOpen(!open)}>
          {open ? 'Hide record' : 'Your record'}
        </button>
      </div>
    </div>
  );
});
Standby.displayName = 'Standby';
