import type { MeDto } from '../../shared/api';
import { difficultyOf, generateBoard } from '../../shared/board';
import { PixelIcon } from './PixelIcon';
import { useState } from 'react';
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

/** The day's difficulty as a coloured stamp, and a subtle hand-written tip about the room. */
export const DayTier = ({ day }: { day: number }) => {
  const diff = difficultyOf(day);
  return (
    <p className="hud-tier">
      <b className={`hud-tier-name tier-${diff.name.toLowerCase()}`}>{diff.name}</b>
      <span className="hud-hint">{generateBoard(day).tip}</span>
    </p>
  );
};

export const Hud = ({ me, day, onHelp, hidden = false }: { me: MeDto; day: number | null; onHelp: () => void; hidden?: boolean }) => (
  // hidden keeps its space, so the board doesn't jump while a cutscene plays
  <header className="hud" style={hidden ? { visibility: 'hidden' } : undefined}>
    <div className="hud-brand">
      {day !== null && <DayTier day={day} />}
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
