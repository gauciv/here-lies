import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CANDLES_PER_DAY, dayStartUtc } from '../../shared/board';
import type { DayDto, GraveDto, MeDto, WeekDayDto } from '../../shared/api';
import { formatTime } from '../../shared/pioneer';
import { loadApi } from '../api';
import { DOOR_INK, FLAME, FLAME_LEGEND, INK_LEGEND, SKULL_INK } from './icons';
import { PixelIcon } from './PixelIcon';
import { MAP_H, MAP_W, RoomMap } from './RoomMap';
import { RUN_DASHES } from './runStyles';

type Snapshot = { day: DayDto; me: MeDto; week: WeekDayDto[] };
type Full = { day: number; runs?: readonly (readonly number[])[]; deaths?: readonly number[]; answer?: readonly GraveDto[] | null };

const weekday = (day: number): string =>
  new Date(dayStartUtc(day)).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

/** A small sample of each run's line style, for the legend. */
const RunLine = ({ k }: { k: number }) => (
  <svg width="26" height="6" viewBox="0 0 26 6" aria-hidden="true">
    <line x1="1" y1="3" x2="25" y2="3" stroke="rgba(58,32,16,0.88)" strokeWidth="1.8" strokeLinecap="round"
      strokeDasharray={(RUN_DASHES[k % RUN_DASHES.length] ?? []).join(' ') || undefined} />
  </svg>
);

/**
 * The dwarf's map, on a scroll: today's room with your own runs inked in (one
 * line style each, a skull where you died), and a page for the week, where a
 * finished day opens onto its full answer. Read fresh every time it opens.
 */
export const MapScroll = ({ day, me, id }: { day: DayDto | null; me: MeDto | null; id?: string }) => {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [page, setPage] = useState<'today' | 'week'>('today');
  const [full, setFull] = useState<Full | null>(null);
  useEffect(() => {
    let alive = true;
    void loadApi()
      .then((api) => api.init())
      .then((res) => { if (alive) setSnap({ day: res.day, me: res.me, week: res.week }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  const d = snap?.day ?? day;
  const who = snap?.me ?? me;
  const streak = who?.streak ?? 0;
  const runs = who?.runs ?? [];

  const openPast = (past: number) => {
    void loadApi()
      .then((api) => api.pastDay(past))
      .then((res) => setFull({ day: res.day, answer: res.graves }))
      .catch(() => undefined);
  };

  return (
    <>
      {full && <MapFull {...full} onClose={() => setFull(null)} />}
      <section className="scroll" id={id} aria-label="Your map">
        <div className="scroll-sheet">
          <div className="scroll-inner">
            <header className="rec-head">
              <p className="rec-day">{d ? `Day ${d.day}` : '…'}</p>
              <p className={`rec-streak${streak ? '' : ' is-cold'}`} aria-label={`${streak} day streak`}>
                <PixelIcon rows={FLAME} legend={FLAME_LEGEND} size={2} />
                <span>{streak}</span>
              </p>
            </header>
            <nav className="rec-tabs" aria-label="Map pages">
              <button className={`rec-tab${page === 'today' ? ' is-on' : ''}`} aria-pressed={page === 'today'} onClick={() => setPage('today')}>Today</button>
              <button className={`rec-tab${page === 'week' ? ' is-on' : ''}`} aria-pressed={page === 'week'} onClick={() => setPage('week')}>This week</button>
            </nav>
            {page === 'today' ? (
              <>
                <figure className="rec-map">
                  {d && snap ? (
                    <button className="map-zoom" aria-label="Open the map full screen" onClick={() => setFull({ day: d.day, runs, deaths: who?.fellInto ?? [] })}>
                      <RoomMap day={d.day} runs={runs} deaths={who?.fellInto ?? []} />
                    </button>
                  ) : <div className="room-map room-map-wait" />}
                  {snap && (
                    <figcaption className="map-hint">
                      {runs.length ? (
                        <span className="run-legend">
                          {runs.map((_, k) => <span key={k}><RunLine k={k} /> {k === runs.length - 1 && who?.crossed ? 'crossed' : `run ${k + 1}`}</span>)}
                        </span>
                      ) : 'Your runs will be inked here'}
                    </figcaption>
                  )}
                </figure>
                {d && (
                  <footer className="rec-foot">
                    <span><PixelIcon rows={SKULL_INK} legend={INK_LEGEND} size={2} /> {d.fallen} fell</span>
                    <span><PixelIcon rows={DOOR_INK} legend={INK_LEGEND} size={2} /> {d.crossed} crossed</span>
                  </footer>
                )}
              </>
            ) : (
              <>
                <ul className="week" aria-label="This week">
                  {(snap?.week ?? []).map((w) => {
                    const today = d !== null && w.day === d.day;
                    const past = d !== null && w.day < d.day;
                    // a day still being played isn't lost yet
                    const lost = w.played && !w.crossed && (!today || w.fell >= CANDLES_PER_DAY);
                    const playing = today && w.played && !w.crossed && !lost;
                    return (
                      <li key={w.day}>
                        <button
                          className={`week-day${today ? ' is-today' : ''}`}
                          aria-label={`${weekday(w.day)}, day ${w.day}: ${w.crossed ? `crossed in ${formatTime(w.time ?? 0)}` : lost ? 'lost' : playing ? 'in progress' : 'not played'}${past ? '. Open its answer' : ''}`}
                          onClick={() => (today ? setPage('today') : past ? openPast(w.day) : undefined)}
                        >
                          <span className="week-name">{today ? 'Today' : weekday(w.day)}</span>
                          <RoomMap day={w.day} zoom={0.28} />
                          <span className="week-mark">
                            {w.crossed ? (
                              <><PixelIcon rows={DOOR_INK} legend={INK_LEGEND} size={1} /> {w.time !== null ? formatTime(w.time) : 'crossed'}</>
                            ) : lost ? (
                              <><PixelIcon rows={SKULL_INK} legend={INK_LEGEND} size={1} /> lost</>
                            ) : playing ? 'walking…' : '—'}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="map-hint">Tap a past day to see its answer</p>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

/** A map, zoomed to fill the screen. Tap anywhere to put it away. */
const MapFull = ({ day, runs, deaths, answer, onClose }: Full & { onClose: () => void }) => {
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
    <div className="map-full" role="dialog" aria-modal="true" aria-label={answer ? `Day ${day}, revealed` : 'Map of the room'} onClick={onClose}>
      {answer && <p className="map-full-title">Day {day}: every pit, and who lied</p>}
      <div className="map-full-sheet">
        <RoomMap day={day} runs={runs ?? []} deaths={deaths ?? []} answer={answer ?? null} zoom={zoom} />
      </div>
      <button className="btn map-full-close" onClick={onClose}>Close map</button>
    </div>,
    document.body,
  );
};

/** As large as the screen allows, leaving room for the sheet's edges, a title and the close button. */
const fitZoom = (): number => Math.max(1, Math.min((window.innerWidth - 56) / MAP_W, (window.innerHeight - 190) / MAP_H));

/** The map over the game board, from the map button in the game bar. */
export const MapOverlay = ({ day, me, onClose }: { day: DayDto | null; me: MeDto | null; onClose: () => void }) =>
  createPortal(
    <div className="map-overlay" role="dialog" aria-modal="true" aria-label="Your map">
      <div className="map-overlay-stage" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <MapScroll day={day} me={me} />
      </div>
      <button className="btn map-overlay-close" onClick={onClose}>Close map</button>
    </div>,
    document.body,
  );
