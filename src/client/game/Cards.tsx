import { useEffect, useState } from 'react';
import { CANDLES_PER_DAY, dayStartUtc } from '../../shared/board';
import { CRUMBLE_AFTER, arrowIsTrue, directionName, isForgotten, validDirections, type Direction } from '../../shared/epitaphs';
import type { Board, Cell } from '../../shared/board';
import { arrowRows } from '../engine/sprites';
import type { ColorKey } from '../engine/palette';
import { PixelIcon } from './PixelIcon';
import type { DayDto, GraveDto, MeDto, MyArrowDto } from '../../shared/api';
import { shareText } from '../../shared/share';
import { pioneerTitle } from '../../shared/pioneer';
import { subredditName } from './reddit';

type Social = { onShare: () => Promise<boolean>; onJoin: () => Promise<boolean> };

/**
 * End-of-run actions. Sharing is two explicit steps (preview, then post);
 * flair and joining sit behind "More". Nothing here is ever required.
 */
const EndActions = ({ me, day, onShare, onJoin, onFlair }: { me: MeDto; day: DayDto; onFlair?: (() => Promise<boolean>) | undefined } & Social) => {
  const [stage, setStage] = useState<'idle' | 'preview' | 'posting'>('idle');
  const [more, setMore] = useState(false);
  const [joined, setJoined] = useState(false);
  const [flaired, setFlaired] = useState(false);
  const [busy, setBusy] = useState(false);
  const sub = subredditName();
  const title = me.pioneer !== null ? pioneerTitle(me.pioneer) : null;
  return (
    <div className="share">
      {me.shared ? (
        <p className="share-done">Your result is in the comments.</p>
      ) : stage === 'idle' ? null : (
        <blockquote className="share-preview">{shareText(day.day, me).replace(/\*\*/g, '')}</blockquote>
      )}
      <div className="vote-row">
        {!me.shared && stage === 'idle' && (
          <button className="btn btn-share" onClick={() => setStage('preview')}>Share result</button>
        )}
        {!me.shared && stage !== 'idle' && (
          <>
            <button className="btn btn-share" disabled={stage === 'posting'} onClick={async () => { setStage('posting'); if (!(await onShare())) setStage('preview'); }}>
              {stage === 'posting' ? 'Posting…' : 'Post comment'}
            </button>
            <button className="btn" disabled={stage === 'posting'} onClick={() => setStage('idle')}>Cancel</button>
          </>
        )}
        {stage === 'idle' && (
          <button className="btn btn-more" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Less' : 'More'}</button>
        )}
      </div>
      {more && stage === 'idle' && (
        <div className="vote-row">
          {onFlair && title && (
            <button className="btn" disabled={busy || flaired} onClick={async () => { setBusy(true); setFlaired(await onFlair()); setBusy(false); }}>
              {flaired ? `Wearing “${title}”` : `Wear “${title}” as flair`}
            </button>
          )}
          <button className="btn" disabled={busy || joined} onClick={async () => { setBusy(true); setJoined(await onJoin()); setBusy(false); }}>
            {joined ? 'Joined' : sub ? `Join r/${sub}` : 'Join the community'}
          </button>
        </div>
      )}
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
      {mine.truthful
        ? mine.saved ? `It saved ${times(mine.saved)}.` : mine.crumbled ? 'Nobody heeded it.' : 'Nobody has heeded it yet.'
        : mine.fooled ? `It fooled ${times(mine.fooled)}.` : mine.crumbled ? 'Nobody fell for it.' : 'Nobody has fallen for it yet.'}
    </p>
  </div>
);

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

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
  const left = Math.max(1, CRUMBLE_AFTER - top.visits);
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
      <ul className="tags" aria-label="About this slab">
        {truth !== null && (
          <li className={`tag ${truth ? 'tag-true' : 'tag-lie'}`}>{truth ? `True · saved ${top.saved}` : `Lie · fooled ${top.fooled}`}</li>
        )}
        <li className="tag">{grave.falls} fell here</li>
        <li className={`tag${left <= 2 ? ' tag-worn' : ''}`}>
          {left <= 1 ? 'Crumbles under the next walker' : `Crumbles after ${left} more walkers`}
        </li>
      </ul>
    </section>
  );
};

/** You fell, but this fall can't carve: say why, then send them back to the stairs. */
/** A death with nothing to carve: your ghost in its pit, the dark all around, and a way back. */
export const FellAgainCard = ({ me, reason, onWalk }: { me: MeDto; reason: 'carvedToday' | 'stoneTaken'; onWalk: () => void }) => (
  <section className="death" aria-label="You died">
    <p className="death-title">You died.</p>
    <p className="death-note">
      {reason === 'carvedToday' ? 'Your one arrow is already carved today.' : 'That stone already bears an arrow.'}
      {' '}{me.candles} of {CANDLES_PER_DAY} candles left.
    </p>
    <button className="btn btn-share" onClick={onWalk}>Respawn</button>
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
        Your arrow is for those who come after. Point it at your pit to warn them, or anywhere else to fool them.
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
        {me.uncarvedSkippable && (
          <button className="btn" disabled={busy} onClick={() => { setBusy(true); onSkip(); }}>Skip for now</button>
        )}
      </div>
      <p className="card-foot carve-rules">
        {me.uncarvedSkippable
          ? 'One arrow a day. Skip to save it for a later death; your last candle must carve.'
          : me.uncarvedReplaces
            ? 'Your last candle must leave an arrow. This stone already has one: yours replaces it.'
            : 'This is your last candle, so you must leave your arrow.'}
      </p>
    </section>
  );
};

export const CrossedCard = ({ me, day, onClose, onShare, onJoin, onFlair }: { me: MeDto; day: DayDto; onClose: () => void; onFlair: () => Promise<boolean> } & Social) => {
  const countdown = useCountdown(day.day);
  const title = me.pioneer !== null ? pioneerTitle(me.pioneer) : null;
  return (
    <section className="card card-win" aria-label="You crossed">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      <p className="card-kicker">The far wall{me.rank ? ` · ${ordinal(me.rank)} across today` : ''}</p>
      <p className="epitaph">You crossed.</p>
      {title && <p className="pioneer-title">{title}</p>}
      <dl className="stats">
        <div><dt>Pioneer</dt><dd>{me.pioneer !== null ? `${me.pioneer}%` : '—'}</dd></div>
        <div><dt>Streak</dt><dd>{me.streak}</dd></div>
      </dl>
      {me.myArrow && <ArrowRecord mine={me.myArrow} />}
      <EndActions me={me} day={day} onShare={onShare} onJoin={onJoin} onFlair={onFlair} />
      <p className="card-foot">Pioneer: share of pits nobody had found when you crossed. New crossing in {countdown}.</p>
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
      <EndActions me={me} day={day} onShare={onShare} onJoin={onJoin} />
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
      <li><span className="intro-icon intro-num">2</span><span>A number counts the pits touching that stone.</span></li>
      <li><span className="intro-icon slab-arrow slab-arrow-sm"><Arrow dir={1} color="pst1" size={3} /></span><span>The fallen carve an arrow toward their pit. Some lie.</span></li>
      <li><span className="intro-icon intro-door" aria-hidden="true" /><span>Find the door hidden somewhere in the far wall. You have 3 candles.</span></li>
    </ol>
    <div className="vote-row">
      <button className="btn btn-share" onClick={onStart}>Light the torch</button>
    </div>
  </section>
);
