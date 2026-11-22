import type { MeDto } from '../../shared/api';
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

export const Hud = ({ me, onHelp }: { me: MeDto; onHelp: () => void }) => (
  <header className="hud">
    <div className="hud-brand">
      <h1 className="logo">Here Lies</h1>
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
