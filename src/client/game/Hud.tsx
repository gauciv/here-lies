import { difficultyOf } from '../../shared/board';
import { dateLabel } from './format';
import type { DayDto, MeDto } from '../../shared/api';
import { PixelIcon } from './PixelIcon';
import { useState } from 'react';
import { SPEAKER_LEGEND, SPEAKER_OFF, SPEAKER_ON } from './icons';
import { Candles } from './Candles';
import { sound } from '../engine/sound';

const MuteButton = () => {
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

export const Hud = ({ day, me, onHelp }: { day: DayDto; me: MeDto; onHelp: () => void }) => (
  <header className="hud">
    <div className="hud-brand">
      <h1 className="logo">Here Lies</h1>
      <span className="hud-sub">
        Day {day.day} · {dateLabel(day.day)} · <b className={`tier tier-${difficultyOf(day.day).name.toLowerCase()}`}>{difficultyOf(day.day).name}</b>
      </span>
    </div>
    <div className="hud-right">
      <div className="hud-row">
        <button className="help" aria-label="How to play" onClick={onHelp}>?</button>
        <MuteButton />
        <Candles lit={me.candles} />
      </div>
      <span className="hud-sub">
        <b className="num-fallen">{day.fallen}</b> fallen · <b className="num-crossed">{day.crossed}</b> crossed
      </span>
    </div>
  </header>
);
