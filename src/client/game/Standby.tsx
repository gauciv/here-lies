import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import type { DayDto, MeDto } from '../../shared/api';
import { CAMP_H, CAMP_W, CampScene, type CampCue } from '../engine/camp';
import { isDayOver } from './reveal';
import { MapScroll } from './MapScroll';

export type StandbyHandle = {
  enter: (onDone: () => void, onCue?: (cue: CampCue) => void) => void;
  /** after a crossing: walk on through the dark until the fire comes into view */
  homeward: (onDone: () => void, onCue?: (cue: CampCue) => void) => void;
  /** then (under a fade) back to the ordinary camp, with its screen */
  settle: () => void;
};

/** The resting room, scaled to whole pixels so the art stays crisp. */
/** an arrival scene: the soul's homecoming after a game over, or the walk home after a crossing */
type Revival = { kind: 'soul' | 'return'; onDone: () => void; onCue: (cue: CampCue) => void };

const CampCanvas = forwardRef<StandbyHandle, { maxScale?: number; revival?: Revival | undefined; victory?: boolean }>(({ maxScale = 4, revival, victory = false }, ref) => {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<CampScene | null>(null);
  const [scale, setScale] = useState(3);
  // read once, when the scene is made: a revival only ever plays on arrival
  const revivalRef = useRef(revival);
  const victoryRef = useRef(victory);

  useEffect(() => {
    if (!canvas.current) return;
    const s = new CampScene(canvas.current);
    scene.current = s;
    if (revivalRef.current) s.revive(revivalRef.current.onDone, revivalRef.current.onCue, revivalRef.current.kind);
    if (victoryRef.current) s.celebrate();
    s.start();
    return () => s.stop();
  }, []);

  useImperativeHandle(ref, () => ({
    enter: (onDone, onCue) => { if (scene.current) scene.current.enter(onDone, onCue); else onDone(); },
    homeward: (onDone, onCue) => { if (scene.current) scene.current.homeward(onDone, onCue); else onDone(); },
    settle: () => scene.current?.settle(),
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

/**
 * The standby screen: the title, a dwarf by a fire in the dark, and one way on.
 * Your record stays folded away until you ask for it.
 */
export const Standby = forwardRef<StandbyHandle, {
  day: DayDto | null; me: MeDto | null; busy: boolean; onEnter: (e: MouseEvent) => void; onReview: (e: MouseEvent) => void; compact?: boolean;
  /** play the soul's homecoming first, and keep the screen bare until it's over */
  revival?: Revival | undefined;
  /** after a crossing: the dwarf celebrates in the dark (bare screen) until he walks home */
  victory?: boolean;
}>(({ day, me, busy, onEnter, onReview, compact = false, revival, victory = false }, ref) => {
  const [open, setOpen] = useState(false);
  const [bare, setBare] = useState(!!revival || victory);
  const canvasRef = useRef<StandbyHandle>(null);
  useImperativeHandle(ref, () => ({
    enter: (onDone, onCue) => {
      if (canvasRef.current) canvasRef.current.enter(onDone, onCue);
      else onDone();
    },
    homeward: (onDone, onCue) => {
      if (canvasRef.current) canvasRef.current.homeward(onDone, onCue);
      else onDone();
    },
    settle: () => { canvasRef.current?.settle(); setBare(false); },
  }), []);
  const [revivalOnce] = useState<Revival | undefined>(() => revival && {
    kind: revival.kind,
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
        <CampCanvas ref={canvasRef} maxScale={compact ? 3 : 4} revival={revivalOnce} victory={victory} />
        {open && <MapScroll day={day} me={me} id="camp-map" />}
      </div>
      <div className="camp-actions">
        {finished ? (
          <button className="btn btn-share btn-enter" onClick={onReview}>{day && !isDayOver(day.day) ? 'Review your run' : 'Review the room'}</button>
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
