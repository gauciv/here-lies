import { useEffect, useState } from 'react';
import { CANDLES_PER_DAY, dayStartUtc } from '../../shared/board';
import { EPITAPHS, epitaphText, isForgotten, verdictOf, type EpitaphId, type Verdict } from '../../shared/epitaphs';
import type { DayDto, EpitaphDto, GraveDto, MeDto, Vote } from '../../shared/api';
import { shareText } from '../../shared/share';
import { context } from '@devvit/web/client';

const subredditName = (): string | null => {
  try {
    return context.subredditName ?? null;
  } catch {
    return null; // local preview has no Reddit context
  }
};

type Social = { onShare: () => Promise<boolean>; onJoin: () => Promise<boolean> };

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
  return (
    <section className="card" aria-label="Grave">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      {top ? (
        <>
          <p className="card-kicker">Here lies {who(top.user, me)}</p>
          <p className="epitaph">“{epitaphText(top.text)}”</p>
          <p className="card-meta">
            {isForgotten(top.user) ? 'Long before today' : `Fell on step ${top.step}`} · <span className={`verdict verdict-${verdict}`}>{VERDICT_LABEL[verdict]}</span>
            {grave.falls > 1 ? ` · ${grave.falls} fell here` : ''}
          </p>
          <VoteRow e={top} me={me} onVote={onVote} />
          {others.length > 0 && (
            <details className="more">
              <summary>{others.length} more last words here</summary>
              <ul>
                {others.map((e) => (
                  <li key={e.id}>
                    <span className="more-text">“{epitaphText(e.text)}”</span>
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
          <p className="card-kicker">{grave.falls} fell here</p>
          <p className="epitaph epitaph-silent">They left no words.</p>
        </>
      )}
    </section>
  );
};

export const CarveCard = ({ me, step, onCarve }: { me: MeDto; step: number | null; onCarve: (t: EpitaphId) => void }) => {
  const [busy, setBusy] = useState(false);
  return (
    <section className="card card-carve" aria-label="Carve your last words">
      <p className="card-kicker">Here lies you</p>
      <p className="epitaph">The stone gave way{step ? ` on step ${step}` : ''}.</p>
      <p className="card-meta">
        Leave last words for whoever walks after you. Tell the truth, or don't.
      </p>
      <div className="carve-grid">
        {EPITAPHS.map((t, k) => (
          <button key={t} className="btn btn-carve" disabled={busy} onClick={() => { setBusy(true); onCarve(k); }}>
            {t}
          </button>
        ))}
      </div>
      <p className="card-foot">
        {me.candles > 0 ? `${me.candles} of ${CANDLES_PER_DAY} candles left. Your next walk begins at the stairs.` : 'That was your last candle.'}
      </p>
    </section>
  );
};

export const CrossedCard = ({ me, day, onClose, onShare, onJoin }: { me: MeDto; day: DayDto; onClose: () => void } & Social) => {
  const countdown = useCountdown(day.day);
  return (
    <section className="card card-win" aria-label="You crossed">
      <button className="card-close" onClick={onClose} aria-label="Close">×</button>
      <p className="card-kicker">The far wall</p>
      <p className="epitaph">You crossed.</p>
      <dl className="stats">
        <div><dt>Arrived</dt><dd>{me.rank ? ordinal(me.rank) : '—'}</dd></div>
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
