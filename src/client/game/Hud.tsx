import type { MeDto } from '../../shared/api';
import { difficultyOf } from '../../shared/board';
import { formatTime } from '../../shared/pioneer';
import { PixelIcon } from './PixelIcon';
import { useEffect, useState } from 'react';
import { SPEAKER_LEGEND, SPEAKER_OFF, SPEAKER_ON } from './icons';
import { Candles } from './Candles';
import { sound } from '../engine/sound';

export const MuteButton = () => {
  const [muted, setMuted] = useState(sound.muted);
  return (
    <button
      className="mute"
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      aria-pressed={muted}
      onClick={() => { sound.setMuted(!muted); setMuted(!muted); }}
    >
      <PixelIcon rows={muted ? SPEAKER_OFF : SPEAKER_ON} legend={SPEAKER_LEGEND} size={2} />
    </button>
  );
};

/** Today's clock: running while you walk, stopped once you cross or your last candle goes out. */
const useRunTime = (me: MeDto): number => {
  const running = me.startedAt !== null && me.endedAt === null && me.time === null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [running]);
  if (me.time !== null) return me.time;
  if (me.startedAt === null) return 0;
  return Math.max(0, (me.endedAt ?? now) - me.startedAt);
};

/** The day's difficulty as a coloured stamp, then your time. */
export const DayTier = ({ day, me }: { day: number; me: MeDto }) => {
  const diff = difficultyOf(day);
  const ms = useRunTime(me);
  return (
    <p className="hud-tier">
      <b className={`hud-tier-name tier-${diff.name.toLowerCase()}`}>{diff.name}</b>
      <span className={`hud-time${me.time !== null ? ' is-final' : ''}`} aria-label={`Time ${formatTime(ms)}`}>{formatTime(ms)}</span>
    </p>
  );
};

export const Hud = ({ me, day, onHelp, hidden = false }: { me: MeDto; day: number | null; onHelp: () => void; hidden?: boolean }) => (
  // hidden keeps its space, so the board doesn't jump while a cutscene plays
  <header className="hud" style={hidden ? { visibility: 'hidden' } : undefined}>
    <div className="hud-brand">
      {day !== null && <DayTier day={day} me={me} />}
    </div>
    <div className="hud-right">
      <div className="hud-row">
        <button className="help" aria-label="How to play" onClick={onHelp}>?</button>
        <MuteButton />
        <Candles lit={me.candles} />
      </div>
    </div>
  </header>
);
