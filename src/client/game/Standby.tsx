import { createPortal } from 'react-dom';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { DayDto, MeDto } from '../../shared/api';
import { loadApi } from '../api';
import { CAMP_H, CAMP_W, CampScene, type CampCue } from '../engine/camp';
import { DOOR_INK, FLAME, FLAME_LEGEND, INK_LEGEND, SKULL_INK } from './icons';
import { PixelIcon } from './PixelIcon';
import { MAP_H, MAP_W, RoomMap } from './RoomMap';

export type StandbyHandle = { enter: (onDone: () => void, onCue?: (cue: CampCue) => void) => void };

/** The resting room, scaled to whole pixels so the art stays crisp. */
type Revival = { onDone: () => void; onCue: (cue: CampCue) => void };

const CampCanvas = forwardRef<StandbyHandle, { maxScale?: number; revival?: Revival | undefined }>(({ maxScale = 4, revival }, ref) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CampScene | null>(null);
  const [scale, setScale] = useState(3);
  // read once, when the scene is made: a revival only ever plays on arrival
  const revivalRef = useRef(revival);

  useEffect(() => {
    if (!canvas.current) return;
    const s = new CampScene(canvas.current);
    scene.current = s;
    if (revivalRef.current) s.revive(revivalRef.current.onDone, revivalRef.current.onCue);
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
 * The dwarf's map of today's room, on a scroll that unrolls when asked for:
 * the day, your streak, a rough sketch of the room, and how many have fallen
 * or crossed. It's read fresh every time it opens.
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
  const streak = me?.streak ?? 0;
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
    {zoomed && d && snap && <MapFull day={d.day} graves={snap.graves} onClose={() => setZoomed(false)} />}
    <section className="scroll" id="camp-map" aria-label="Your map of today's room">
      <div className="scroll-sheet">
        <div className="scroll-inner">
          <header className="rec-head">
            <p className="rec-day">{d ? `Day ${d.day}` : '…'}</p>
            <p className={`rec-streak${streak ? '' : ' is-cold'}`} aria-label={`${streak} day streak`}>
              <PixelIcon rows={FLAME} legend={FLAME_LEGEND} size={2} />
              <span>{streak}</span>
            </p>
          </header>
          <figure className="rec-map">
            {d && snap ? (
              <button className="map-zoom" aria-label="Open the map full screen" onClick={() => setZoomed(true)}>
                <RoomMap day={d.day} graves={snap.graves} />
              </button>
            ) : <div className="room-map room-map-wait" />}
            {snap && <figcaption className="map-hint">Tap the map to look closer</figcaption>}
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
    </>
  );
};

/** The map, zoomed in to fill the screen. Tap anywhere to put it away. */
const MapFull = ({ day, graves, onClose }: { day: number; graves: readonly number[]; onClose: () => void }) => {
  const [zoom, setZoom] = useState(() => fitZoom());
  useEffect(() => {
    const onResize = () => setZoom(fitZoom());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  // portalled to the page root: the camp's layout containment would trap a fixed layer
  return createPortal(
    <div className="map-full" role="dialog" aria-modal="true" aria-label="Map of today's room" onClick={onClose}>
      <div className="map-full-sheet">
        <RoomMap day={day} graves={graves} zoom={zoom} />
      </div>
      <button className="btn map-full-close" onClick={onClose}>Close map</button>
    </div>,
    document.body,
  );
};

/** As large as the screen allows, leaving room for the sheet's edges and the close button. */
const fitZoom = (): number => Math.max(1, Math.min((window.innerWidth - 56) / MAP_W, (window.innerHeight - 150) / MAP_H));

/**
 * The standby screen: the title, a dwarf by a fire in the dark, and one way on.
 * Your record stays folded away until you ask for it.
 */
export const Standby = forwardRef<StandbyHandle, {
  day: DayDto | null; me: MeDto | null; busy: boolean; onEnter: (e: MouseEvent) => void; onReview: (e: MouseEvent) => void; compact?: boolean;
  /** play the soul's homecoming first, and keep the screen bare until it's over */
  revival?: Revival | undefined;
}>(({ day, me, busy, onEnter, onReview, compact = false, revival }, ref) => {
  const [open, setOpen] = useState(false);
  const [bare, setBare] = useState(!!revival);
  const [revivalOnce] = useState<Revival | undefined>(() => revival && {
    onCue: revival.onCue,
    onDone: () => { setBare(false); revival.onDone(); },
  });
  const finished = !!me && (me.crossed || me.candles <= 0) && me.uncarved === null;
  return (
    <div className={`standby${compact ? ' standby-compact' : ''}${bare ? ' is-bare' : ''}`}>
      <header className="camp-head">
        <h1 className="camp-title">Here Lies</h1>
        {day && <p className="camp-room">{day.room}</p>}
      </header>
      <div className="camp-middle">
        <CampCanvas ref={ref} maxScale={compact ? 3 : 4} revival={revivalOnce} />
        {open && <Record day={day} me={me} />}
      </div>
      <div className="camp-actions">
        {finished ? (
          <button className="btn btn-share btn-enter" onClick={onReview}>Review the room</button>
        ) : (
          <button className="btn btn-share btn-enter" disabled={busy || !me} onClick={onEnter}>Enter the dungeon</button>
        )}
        <button className="btn btn-record" aria-expanded={open} aria-controls="camp-map" onClick={() => setOpen(!open)}>
          {open ? 'Hide map' : 'Your map'}
        </button>
      </div>
    </div>
  );
});
Standby.displayName = 'Standby';
