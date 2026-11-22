import type { MouseEvent } from 'react';
import { CANDLES_PER_DAY } from '../../shared/board';
import { formatTime } from '../../shared/pioneer';
import type { ResultPost } from '../../shared/share';
import { FLAME, FLAME_LEGEND } from './icons';
import { PixelIcon } from './PixelIcon';
import { TileIcon } from './TileIcon';

/**
 * The game card under a shared result: the player's caption is the post title
 * above it. Spoiler-free: the room, the time and the standing, never the path.
 */
export const ResultPostCard = ({ card, onPlay }: { card: ResultPost; onPlay: (e: MouseEvent) => void }) => (
  <main className="result-post app">
    <div className="result-card">
      <p className="result-brand">Here Lies</p>
      <p className="result-room">{card.room}</p>
      <p className="result-day">Day {card.day} · <span className={`tier-${card.tier.toLowerCase()}`}>{card.tier}</span></p>
      <div className="result-slab"><TileIcon kind="slab" scale={4} /></div>
      {card.crossed && card.time !== null ? (
        <>
          <p className="result-who">u/{card.user} crossed in</p>
          <p className="result-time">{formatTime(card.time)}</p>
          {card.title && card.percent !== null && (
            <p className="result-standing">
              <b className={`standing-${card.title.toLowerCase()}`}>{card.title}</b>
              {card.total === null || card.total <= 1 ? ' · first across' : card.percent <= 50 ? ` · top ${card.percent}% of ${card.total} crossers` : ` · crossed with ${card.total - 1} others`}
            </p>
          )}
        </>
      ) : (
        <p className="result-who">The dark took all {CANDLES_PER_DAY} of u/{card.user}'s candles.</p>
      )}
      {card.streak > 0 && (
        <p className="result-streak"><PixelIcon rows={FLAME} legend={FLAME_LEGEND} size={2} /> {card.streak} day streak</p>
      )}
      <button className="btn btn-share result-play" onClick={onPlay}>Try this room</button>
    </div>
  </main>
);
