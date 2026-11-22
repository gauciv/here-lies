import { useEffect, useState } from 'react';
import { CANDLES_PER_DAY, dayStartUtc } from '../../shared/board';
import { directionName, isForgotten, validDirections, verdictOf, type Direction, type Verdict } from '../../shared/epitaphs';
import type { Cell } from '../../shared/board';
import { arrowRows } from '../engine/sprites';
import type { ColorKey } from '../engine/palette';
import { PixelIcon } from './PixelIcon';
import type { DayDto, EpitaphDto, GraveDto, MeDto, Vote } from '../../shared/api';
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

const VERDICT_LABEL: Record<Verdict, string> = {
  trusted: 'Trusted',
  liar: 'Known liar',
  disputed: 'Disputed',
  unjudged: 'Unjudged',
};

const who = (user: string, me: MeDto): string =>
  user === me.username ? 'you' : isForgotten(user) ? 'a forgotten soul' : `u/${user}`;

const VERDICT_INK: Record<Verdict, ColorKey> = { trusted: 'warm4', liar: 'red2', disputed: 'pst1', unjudged: 'pst1' };

const Arrow = ({ dir, color, size }: { dir: Direction; color: ColorKey; size: number }) => (
  <PixelIcon rows={arrowRows(dir)} legend={{ '#': color }} size={size} title={`arrow pointing ${directionName(dir)}`} />
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

const VoteRow = ({ e, me, onVote }: { e: EpitaphDto; me: MeDto; onVote: (id: string, v: Vote) => void }) => {
  const own = e.user === me.username;
  const voted = e.myVote !== null;
  return (
    <div className="vote-row">
      <button className={`btn btn-honest${e.myVote === 'honest' ? ' is-picked' : ''}`} disabled={own || voted} onClick={() => onVote(e.id, 'honest')}>
        Honest <span className="count">{e.honest}</span>
      </button>
      <button className={`btn btn-liar${e.myVote === 'liar' ? ' is-picked' : ''}`} disabled={own || voted} onClick={() => onVote(e.id, 'liar')}>
        Liar <span className="count">{e.liar}</span>
      </button>
    </div>
  );
};

export const GraveCard = ({ grave, list, me, onVote, onClose }: {
  grave: GraveDto; list: EpitaphDto[] | undefined; me: MeDto; onVote: (id: string, v: Vote) => void; onClose: () => void;
}) => {
  const top = grave.top;
  const others = (list ?? []).filter((e) => e.id !== top?.id);
  const verdict = top ? verdictOf(top.honest, top.liar) : 'unjudged';
  const fellHere = grave.falls === 1 ? 'Fell from this stone' : `${grave.falls} fell from this stone`;
  return (
    <section className="card" aria-label="Grave slab">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      {top ? (
        <>
          <p className="card-kicker">Here lies {who(top.user, me)}</p>
          <div className="slab-read">
            <span className="slab-arrow"><Arrow dir={top.arrow} color={VERDICT_INK[verdict]} size={6} /></span>
            <p className="epitaph">“The pit is {directionName(top.arrow)}.”</p>
          </div>
          <p className="card-meta">
            {fellHere} · {isForgotten(top.user) ? 'long before today' : `on step ${top.step}`} · <span className={`verdict verdict-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
          </p>
          <VoteRow e={top} me={me} onVote={onVote} />
          {others.length > 0 && (
            <details className="more">
              <summary>{others.length} more {others.length === 1 ? 'arrow' : 'arrows'} carved here</summary>
              <ul>
                {others.map((e) => (
                  <li key={e.id}>
                    <span className="more-text">
                      <Arrow dir={e.arrow} color={VERDICT_INK[verdictOf(e.honest, e.liar)]} size={3} /> {directionName(e.arrow)}
                    </span>
                    <span className="more-who">{who(e.user, me)} · {e.honest} honest · {e.liar} liar</span>
                    {e.myVote === null && e.user !== me.username && <VoteRow e={e} me={me} onVote={onVote} />}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <>
          <p className="card-kicker">{fellHere}</p>
          <p className="epitaph epitaph-silent">Nothing is carved yet.</p>
        </>
      )}
    </section>
  );
};

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
        Carve an arrow into the slab where you stood{step ? ` (step ${step})` : ''}. Point at the pit to warn the next wanderer, or point elsewhere to lie.
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
      <p className="card-meta">Your graves will guide, or mislead, everyone who walks today. You can still judge the dead: tap any grave.</p>
      <ShareBlock me={me} day={day} onShare={onShare} onJoin={onJoin} />
      <p className="card-foot">{day.crossed} crossed · {day.fallen} fell · new crossing in {countdown}</p>
    </section>
  );
};
