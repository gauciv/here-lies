import { useEffect, useState } from 'react';
import { CANDLES_PER_DAY, dayStartUtc } from '../../shared/board';
import { arrowIsTrue, directionName, isForgotten, validDirections, type Direction } from '../../shared/epitaphs';
import type { Board, Cell } from '../../shared/board';
import { arrowRows } from '../engine/sprites';
import type { ColorKey } from '../engine/palette';
import { PixelIcon } from './PixelIcon';
import type { DayDto, GraveDto, MeDto, MyArrowDto } from '../../shared/api';
import { formatTime } from '../../shared/pioneer';
import { subredditName } from './reddit';
import { TileIcon } from './TileIcon';
import { CANDLE_LEGEND, CANDLE_LIT, FLAME, FLAME_LEGEND } from './icons';

type Social = { onShare: () => Promise<boolean>; onJoin: () => Promise<boolean> };

/**
 * End-of-run actions. Sharing is two explicit steps (preview, then post);
 * flair and joining sit behind "More". Nothing here is ever required.
 */
const EndActions = ({ me, onShare, onJoin, onFlair }: { me: MeDto; onFlair?: (() => Promise<boolean>) | undefined } & Social) => {
  const [joined, setJoined] = useState(false);
  const [flaired, setFlaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const sub = subredditName();
  const title = me.standing?.title ?? null;
  return (
    <div className="share">
      <div className="vote-row">
        <button className="btn btn-share" disabled={busy || me.shared} onClick={async () => { setBusy(true); await onShare(); setBusy(false); }}>
          {me.shared ? 'Shared' : 'Share result'}
        </button>
      </div>
      <div className="end-links">
        {onFlair && title && (
          <button className="link" disabled={busy || flaired} onClick={async () => { setBusy(true); setFlaired(await onFlair()); setBusy(false); }}>
            {flaired ? `Wearing ${title}` : `Wear ${title} as flair`}
          </button>
        )}
        <button className="link" disabled={busy || joined} onClick={async () => { setBusy(true); setJoined(await onJoin()); setBusy(false); }}>
          {joined ? 'Joined' : sub ? `Join r/${sub}` : 'Join the community'}
        </button>
      </div>
    </div>
  );
};

const who = (user: string, me: MeDto): string =>
  user === me.username ? 'you' : isForgotten(user) ? 'a forgotten soul' : `u/${user}`;

const Arrow = ({ dir, color, size }: { dir: Direction; color: ColorKey; size: number }) => (
  <PixelIcon rows={arrowRows(dir)} legend={{ '#': color }} size={size} title={`arrow pointing ${directionName(dir)}`} />
);

const times = (n: number): string => (n === 1 ? '1 walker' : `${n} walkers`);

/** What your own arrow did today; the verdict is revealed once your run is over. */
const ArrowRecord = ({ mine }: { mine: MyArrowDto }) => (
  <div className="arrow-record">
    <span className="slab-arrow slab-arrow-sm"><Arrow dir={mine.arrow} color={mine.truthful ? 'warm4' : 'red2'} size={3} /></span>
    <p className="card-meta">
      Your arrow {mine.truthful ? 'told the truth' : 'lied'}{mine.crumbled ? ` and has crumbled after ${times(mine.visits)}` : ''}.{' '}
      {mine.waiting ? 'It still waits beneath another slab.' : mine.truthful
        ? mine.saved ? `It saved ${times(mine.saved)}.` : mine.crumbled ? 'Nobody heeded it.' : 'Nobody has heeded it yet.'
        : mine.fooled ? `It fooled ${times(mine.fooled)}.` : mine.crumbled ? 'Nobody fell for it.' : 'Nobody has fallen for it yet.'}
    </p>
  </div>
);


const useCountdown = (day: number): string => {
  const target = dayStartUtc(day + 1);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

/** A slab: one arrow. While you walk it is only a claim; after your run, the truth. */
export const GraveCard = ({ grave, me, board, judged, onClose }: {
  grave: GraveDto; me: MeDto; board: Board; judged: boolean; onClose: () => void;
}) => {
  const top = grave.top;
  const truth = top && judged ? arrowIsTrue(board, grave.i, top.arrow) : null;
  if (!top) return null;
  return (
    <section className="card card-grave" aria-label="Grave slab">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      <div className="grave-head">
        <span className="slab-arrow"><Arrow dir={top.arrow} color={truth === true ? 'warm4' : truth === false ? 'red2' : 'pst1'} size={5} /></span>
        <div className="grave-title">
          <p className="card-kicker">Here lies {who(top.user, me)}</p>
          <p className="epitaph">“The pit is {directionName(top.arrow)}.”</p>
        </div>
      </div>
      {truth !== null && (
        <ul className="tags" aria-label="About this slab">
          <li className={`tag ${truth ? 'tag-true' : 'tag-lie'}`}>{truth ? 'It told the truth' : 'It lied'}</li>
        </ul>
      )}
    </section>
  );
};

/** You fell, but this fall can't carve: say why, then send them back to the stairs. */
/** A death with nothing to carve: your ghost in its pit, the dark all around, and a way back. */
export const FellAgainCard = ({ me, onWalk }: { me: MeDto; onWalk: () => void }) => (
  <section className="death" aria-label="You died">
    <p className="death-title">You died.</p>
    <p className="death-note">Your one arrow is already carved today. {me.candles} of {CANDLES_PER_DAY} candles left.</p>
    <button className="btn btn-share" onClick={onWalk}>Respawn</button>
  </section>
);

/** The last candle is out: the same quiet death, and the way back to camp. */
export const GameOverCard = ({ onCamp }: { onCamp: () => void }) => (
  <section className="death" aria-label="Your candles are spent">
    <p className="death-title">You died.</p>
    <p className="death-note">Your last candle is out. The room will wait for you at camp.</p>
    <button className="btn btn-share" onClick={onCamp}>Back to camp</button>
  </section>
);

/** Compass layout: grid position → direction (null = the slab itself). */
const COMPASS: readonly (Direction | null)[] = [7, 0, 1, 6, null, 2, 5, 4, 3];

/**
 * Carving, docked so the board stays visible: your ghost stands on the slab,
 * picking an arrow previews it on the board, and "Carve" makes it final.
 */
export const CarveCard = ({ me, board, stone, fellToward, selected, onSelect, onCarve, onSkip }: {
  me: MeDto; board: Board; stone: Cell; fellToward: Direction | null; selected: Direction | null;
  onSelect: (d: Direction) => void; onCarve: (d: Direction) => void; onSkip: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const valid = validDirections(board, stone);
  const verdict = selected === null
    ? 'The glowing arrow is the way you really fell.'
    : selected === fellToward
      ? 'The truth: it points at the pit that took you.'
      : 'A lie: it points away from your pit.';
  return (
    <section className="card card-carve card-dock" aria-label="Carve your arrow">
      <p className="carve-title">You died.</p>
      <p className="carve-what">
        Point your arrow at your pit to warn those who follow, or anywhere else to fool them.
        {me.uncarvedQueued && ' This stone already bears an arrow; yours will wait beneath it until that one crumbles.'}
      </p>
      <div className="compass" role="group" aria-label="Choose an arrow">
        {COMPASS.map((d, k) =>
          d === null ? (
            <span key={k} className="compass-core" aria-hidden="true" />
          ) : (
            <button
              key={k}
              className={`btn btn-compass${d === selected ? ' is-picked' : d === fellToward ? ' is-truth' : ''}`}
              disabled={busy || !valid.includes(d)}
              aria-pressed={d === selected}
              aria-label={`Aim the arrow ${directionName(d)}${d === fellToward ? ' (the way you fell)' : ''}`}
              onClick={() => onSelect(d)}
            >
              <Arrow dir={d} color={valid.includes(d) ? 'ink' : 'pst2'} size={3} />
            </button>
          )
        )}
      </div>
      <p className={`carve-verdict${selected === null ? '' : selected === fellToward ? ' is-true' : ' is-lie'}`}>{verdict}</p>
      <div className="vote-row carve-actions">
        <button className="btn btn-share" disabled={busy || selected === null} onClick={() => { if (selected === null) return; setBusy(true); onCarve(selected); }}>
          Carve
        </button>
        <button className="btn" disabled={busy} onClick={() => { setBusy(true); onSkip(); }}>
          {me.candles > 0 ? 'Skip for now' : 'Leave no mark'}
        </button>
      </div>
      <p className="card-foot carve-rules">
        {me.candles > 0
          ? 'One arrow a day. Skip to save it for a later death, or never carve at all.'
          : 'Your last candle is out. Carve your one arrow, or leave no mark.'}
      </p>
    </section>
  );
};

/**
 * The crossing: no panel, just the result over the dark while your dwarf
 * cheers in the torchlight. Share it, or carry on to the camp.
 */
export const VictoryCard = ({ me, onShare, onContinue, onJoin, onFlair }: { me: MeDto; onContinue: () => void; onFlair: () => Promise<boolean> } & Social) => {
  const [busy, setBusy] = useState(false);
  const [flaired, setFlaired] = useState(false);
  const [joined, setJoined] = useState(false);
  const sub = subredditName();
  const st = me.standing;
  return (
    <section className="victory" aria-label="You crossed">
      <p className="victory-title">You crossed.</p>
      {me.time !== null && <p className="victory-time" aria-label={`Time ${formatTime(me.time)}`}>{formatTime(me.time)}</p>}
      {st && (
        <p className="victory-standing">
          <b className={`standing-${st.title.toLowerCase()}`}>{st.title}</b>
          {st.total === 1 ? ' · first across today' : st.percent <= 50 ? ` · top ${st.percent}% of today's ${st.total} crossers` : ` · #${st.position} of ${st.total} crossers today`}
        </p>
      )}
      <p className="victory-streak">
        <PixelIcon rows={FLAME} legend={FLAME_LEGEND} size={2} /> {me.streak} day streak
      </p>
      <div className="vote-row victory-actions">
        <button className="btn btn-share" disabled={busy || me.shared} onClick={async () => { setBusy(true); await onShare(); setBusy(false); }}>
          {me.shared ? 'Shared' : 'Share result'}
        </button>
        <button className="btn" disabled={busy} onClick={onContinue}>Continue</button>
      </div>
      <div className="end-links">
        {st && (
          <button className="link" disabled={busy || flaired} onClick={async () => { setBusy(true); setFlaired(await onFlair()); setBusy(false); }}>
            {flaired ? `Wearing ${st.title}` : `Wear ${st.title} as flair`}
          </button>
        )}
        <button className="link" disabled={busy || joined} onClick={async () => { setBusy(true); setJoined(await onJoin()); setBusy(false); }}>
          {joined ? 'Joined' : sub ? `Join r/${sub}` : 'Join the community'}
        </button>
      </div>
    </section>
  );
};

export const SpentCard = ({ me, day, onClose, onShare, onJoin }: { me: MeDto; day: DayDto; onClose: () => void } & Social) => {
  const countdown = useCountdown(day.day);
  return (
    <section className="card" aria-label="Out of candles">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      <p className="card-kicker">Your candles are spent</p>
      <p className="epitaph">Rest now.</p>
      <p className="card-meta">The dark has lifted: every pit is shown, and every arrow is revealed as truth or lie.</p>
      {me.myArrow && <ArrowRecord mine={me.myArrow} />}
      <EndActions me={me} onShare={onShare} onJoin={onJoin} />
      <p className="card-foot">{day.crossed} crossed · {day.fallen} fell · new crossing in {countdown}</p>
    </section>
  );
};

/** Shown once on a player's first visit, and from the "?" in the top bar. */
export const IntroCard = ({ onStart }: { onStart: () => void }) => (
  <section className="card card-intro" aria-label="How to play">
    <p className="card-kicker">How it works</p>
    <p className="epitaph">Cross the dark.</p>
    <ol className="intro-steps">
      <li><span className="intro-icon"><TileIcon kind="number" /></span><span>A number counts the pits around that stone, diagonals too.</span></li>
      <li><span className="intro-icon"><TileIcon kind="slab" /></span><span>The fallen leave a slab with an arrow toward their pit. Some lie.</span></li>
      <li><span className="intro-icon"><TileIcon kind="door" scale={1} /></span><span>Find the door hidden in the far wall. It moves every day.</span></li>
      <li><span className="intro-icon"><PixelIcon rows={CANDLE_LIT[0]!} legend={CANDLE_LEGEND} size={2} /></span><span>Three candles a day. Each fall burns one.</span></li>
    </ol>
    <div className="vote-row">
      <button className="btn btn-share" onClick={onStart}>Got it</button>
    </div>
  </section>
);
