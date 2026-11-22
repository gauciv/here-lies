import { useEffect, useState } from 'react';
import { CANDLES_PER_DAY, dayStartUtc } from '../../shared/board';
import { arrowIsTrue, directionName, isForgotten, validDirections, type Direction } from '../../shared/epitaphs';
import type { Board, Cell } from '../../shared/board';
import { arrowRows } from '../engine/sprites';
import type { ColorKey } from '../engine/palette';
import { PixelIcon } from './PixelIcon';
import type { DayDto, GraveDto, MeDto, MyArrowDto } from '../../shared/api';
import { shareText } from '../../shared/share';
import { pioneerTitle } from '../../shared/pioneer';
import { context } from '@devvit/web/client';

const subredditName = (): string | null => {
  try {
    return context.subredditName ?? null;
  } catch {
    return null; // local preview has no Reddit context
  }
};

type Social = { onShare: () => Promise<boolean>; onJoin: () => Promise<boolean> };

/** Explicit opt-in: wear today's pioneer title as subreddit flair. */
const FlairButton = ({ title, onFlair }: { title: string; onFlair: () => Promise<boolean> }) => {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <button className="btn btn-flair" disabled={state !== 'idle'} onClick={async () => { setState('busy'); setState((await onFlair()) ? 'done' : 'idle'); }}>
      {state === 'done' ? `Wearing “${title}”` : state === 'busy' ? 'Setting flair…' : `Wear “${title}” as flair`}
    </button>
  );
};

/** Optional, explicit actions: preview the comment, post it; separately, join. */
const ShareBlock = ({ me, day, onShare, onJoin }: { me: MeDto; day: DayDto } & Social) => {
  const [busy, setBusy] = useState<'share' | 'join' | null>(null);
  const [joined, setJoined] = useState(false);
  const text = shareText(day.day, me);
  const sub = subredditName();
  return (
    <div className="share">
      {me.shared ? (
        <p className="share-done">Your result is in the comments.</p>
      ) : (
        <>
          <p className="share-label">Post this as a comment?</p>
          <blockquote className="share-preview">{text.replace(/\*\*/g, '')}</blockquote>
        </>
      )}
      <div className="vote-row">
        {!me.shared && (
          <button className="btn btn-share" disabled={busy !== null} onClick={async () => { setBusy('share'); await onShare(); setBusy(null); }}>
            {busy === 'share' ? 'Posting…' : 'Post comment'}
          </button>
        )}
        <button className="btn" disabled={busy !== null || joined} onClick={async () => { setBusy('join'); setJoined(await onJoin()); setBusy(null); }}>
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
      Your arrow {mine.truthful ? 'told the truth' : 'lied'}.{' '}
      {mine.truthful
        ? mine.saved ? `It has saved ${times(mine.saved)} so far.` : 'Nobody has heeded it yet.'
        : mine.fooled ? `It has fooled ${times(mine.fooled)} so far.` : 'Nobody has fallen for it yet.'}
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
  const fellHere = grave.falls === 1 ? '1 fell from this stone' : `${grave.falls} fell from this stone`;
  const truth = top && judged ? arrowIsTrue(board, grave.i, top.arrow) : null;
  return (
    <section className="card" aria-label="Grave slab">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      {top ? (
        <>
          <p className="card-kicker">Here lies {who(top.user, me)}</p>
          <div className="slab-read">
            <span className="slab-arrow"><Arrow dir={top.arrow} color={truth === true ? 'warm4' : truth === false ? 'red2' : 'pst1'} size={6} /></span>
            <p className="epitaph">“The pit is {directionName(top.arrow)}.”</p>
          </div>
          {truth !== null ? (
            <p className={`stamp ${truth ? 'stamp-true' : 'stamp-lie'}`}>
              {truth ? `True · saved ${times(top.saved)}` : `A lie · fooled ${times(top.fooled)}`}
            </p>
          ) : (
            <p className="card-meta">Is it the truth? You'll know when your run is over.</p>
          )}
          <p className="card-foot">{fellHere}{isForgotten(top.user) ? ' · long before today' : ` · on step ${top.step}`}</p>
        </>
      ) : (
        <>
          <p className="card-kicker">{fellHere}</p>
          <p className="epitaph epitaph-silent">Nothing is carved here.</p>
        </>
      )}
    </section>
  );
};

/** You fell, but this fall can't carve: say why, then send them back to the stairs. */
export const FellAgainCard = ({ me, reason, onWalk }: { me: MeDto; reason: 'carvedToday' | 'stoneTaken'; onWalk: () => void }) => (
  <section className="card" aria-label="You fell">
    <p className="card-kicker">The dark takes you</p>
    <p className="epitaph">You fell.</p>
    <p className="card-meta">
      {reason === 'carvedToday'
        ? 'You already carved your one arrow today, so this fall leaves no new mark.'
        : 'Someone already carved an arrow on the stone you stood on. Your fall only adds to its count.'}
    </p>
    <div className="vote-row">
      <button className="btn btn-share" onClick={onWalk}>Walk again</button>
    </div>
    <p className="card-foot">{me.candles} of {CANDLES_PER_DAY} candles left.</p>
  </section>
);

/** Compass layout: grid position → direction (null = the slab itself). */
const COMPASS: readonly (Direction | null)[] = [7, 0, 1, 6, null, 2, 5, 4, 3];

export const CarveCard = ({ me, step, stone, fellToward, onCarve }: {
  me: MeDto; step: number | null; stone: Cell; fellToward: Direction | null; onCarve: (d: Direction) => void;
}) => {
  const [busy, setBusy] = useState(false);
  const valid = validDirections(stone);
  return (
    <section className="card card-carve" aria-label="Carve your arrow">
      <p className="card-kicker">Here lies you</p>
      <p className="epitaph">{fellToward !== null ? `You fell ${directionName(fellToward)}.` : 'The stone gave way.'}</p>
      <p className="card-meta">
        Carve an arrow on the stone you stood on{step ? ` (step ${step})` : ''}. Point at the pit, or lie.
      </p>
      <div className="compass" role="group" aria-label="Choose an arrow">
        {COMPASS.map((d, k) =>
          d === null ? (
            <span key={k} className="compass-core" aria-hidden="true" />
          ) : (
            <button
              key={k}
              className={`btn btn-compass${d === fellToward ? ' is-truth' : ''}`}
              disabled={busy || !valid.includes(d)}
              aria-label={`Carve an arrow pointing ${directionName(d)}${d === fellToward ? ' (the truth)' : ''}`}
              onClick={() => { setBusy(true); onCarve(d); }}
            >
              <Arrow dir={d} color={valid.includes(d) ? 'ink' : 'pst2'} size={4} />
            </button>
          )
        )}
      </div>
      <p className="card-foot">
        {me.candles > 0 ? `${me.candles} of ${CANDLES_PER_DAY} candles left. Your next walk begins at the stairs.` : 'That was your last candle.'}
      </p>
    </section>
  );
};

export const CrossedCard = ({ me, day, onClose, onShare, onJoin, onFlair }: { me: MeDto; day: DayDto; onClose: () => void; onFlair: () => Promise<boolean> } & Social) => {
  const countdown = useCountdown(day.day);
  return (
    <section className="card card-win" aria-label="You crossed">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      <p className="card-kicker">The far wall</p>
      <p className="epitaph">You crossed.</p>
      {me.pioneer !== null && (
        <p className="pioneer">
          <span className="pioneer-title">{pioneerTitle(me.pioneer)}</span>
          <span className="card-meta">
            {me.pioneer}% of the pits were still unmapped when you crossed{me.rank ? `, ${ordinal(me.rank)} across today` : ''}.
          </span>
          <FlairButton title={pioneerTitle(me.pioneer)} onFlair={onFlair} />
        </p>
      )}
      <dl className="stats">
        <div><dt>Pioneer</dt><dd>{me.pioneer !== null ? `${me.pioneer}%` : '—'}</dd></div>
        <div><dt>Steps</dt><dd>{me.steps ?? '—'}</dd></div>
        <div><dt>Candles</dt><dd>{me.candles}/{CANDLES_PER_DAY}</dd></div>
        <div><dt>Streak</dt><dd>{me.streak}</dd></div>
      </dl>
      {me.myArrow && <ArrowRecord mine={me.myArrow} />}
      <ShareBlock me={me} day={day} onShare={onShare} onJoin={onJoin} />
      <p className="card-foot">{day.fallen} lie behind you. A new crossing opens in {countdown}.</p>
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
      <p className="card-meta">The dark has lifted: every pit is shown, and every arrow is revealed as truth or lie. Tap any slab.</p>
      {me.myArrow && <ArrowRecord mine={me.myArrow} />}
      <ShareBlock me={me} day={day} onShare={onShare} onJoin={onJoin} />
      <p className="card-foot">{day.crossed} crossed · {day.fallen} fell · new crossing in {countdown}</p>
    </section>
  );
};
