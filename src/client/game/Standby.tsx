import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { difficultyOf } from '../../shared/board';
import type { DayDto, MeDto } from '../../shared/api';
import { loadApi } from '../api';
import { CAMP_H, CAMP_W, CampScene, type CampCue } from '../engine/camp';
import { DOOR_INK, FLAME, FLAME_LEGEND, INK_LEGEND, SKULL_INK } from './icons';
import { PixelIcon } from './PixelIcon';
import { RoomMap } from './RoomMap';

export type StandbyHandle = { enter: (onDone: () => void, onCue?: (cue: CampCue) => void) => void };

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

type Snapshot = { day: DayDto; graves: number[] };

/**
 * The dwarf's guide to today's room, on a scroll that unrolls when asked for:
 * the day, how hard it is, a rough map, and how many have fallen or crossed.
 * It's read fresh every time it opens.
 */
const Record = ({ day, me }: { day: DayDto | null; me: MeDto | null }) => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useEffect(() => {
    let alive = true;
    void loadApi()
      .then((api) => api.init())
      .then((res) => { if (alive) setSnap({ day: res.day, graves: res.graves.filter((g) => g.top).map((g) => g.i) }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const d = snap?.day ?? day;
  const diff = d ? difficultyOf(d.day) : null;
  const streak = me?.streak ?? 0;
  return (
    <section className="scroll" id="camp-record" aria-label="Your guide to today's room">
      <div className="scroll-sheet">
        <div className="scroll-inner">
          <header className="rec-head">
            <p className="rec-day">{d ? `Day ${d.day}` : '…'}</p>
            <p className={`rec-streak${streak ? '' : ' is-cold'}`} aria-label={`${streak} day streak`}>
              <PixelIcon rows={FLAME} legend={FLAME_LEGEND} size={2} />
              <span>{streak}</span>
            </p>
          </header>
          {diff && (
            <div className="rec-tier">
              <p className={`rec-tier-name rec-${diff.name.toLowerCase()}`}>{diff.name}</p>
              <p className="rec-hint">{diff.hint}</p>
            </div>
          )}
          <figure className="rec-map">
            {d && <figcaption>{d.room}</figcaption>}
            {d && snap ? <RoomMap day={d.day} graves={snap.graves} /> : <div className="room-map room-map-wait" />}
          </figure>
          {d && (
            <footer className="rec-foot">
              <span><PixelIcon rows={SKULL_INK} legend={INK_LEGEND} size={2} /> {d.fallen} fell</span>
              <span><PixelIcon rows={DOOR_INK} legend={INK_LEGEND} size={2} /> {d.crossed} crossed</span>
            </footer>
          )}
        </div>
      </div>
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
        {open && <Record day={day} me={me} />}
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
