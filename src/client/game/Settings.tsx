import { useState } from 'react';
import { sound, type Channel } from '../engine/sound';
import { GEAR, GEAR_LEGEND } from './icons';
import { PixelIcon } from './PixelIcon';

export const GearButton = ({ onClick }: { onClick: () => void }) => (
  <button className="gear" aria-label="Settings" onClick={onClick}>
    <PixelIcon rows={GEAR} legend={GEAR_LEGEND} size={2} />
  </button>
);

const Volume = ({ ch, label }: { ch: Channel; label: string }) => {
  const [v, setV] = useState(() => Math.round(sound.volume(ch) * 100));
  return (
    <div className="settings-row">
      <label htmlFor={`vol-${ch}`}><span>{label}</span><span>{v}%</span></label>
      <input
        id={`vol-${ch}`} type="range" min={0} max={100} step={5} value={v}
        onChange={(e) => { const n = Number(e.target.value); setV(n); sound.setVolume(ch, n / 100); if (ch === 'sfx') sound.play('step'); }}
      />
    </div>
  );
};

/** Music and sound-effect volumes, and a way to see the intro or the tutorial again. */
export const Settings = ({ onClose, onIntro, onTutorial }: { onClose: () => void; onIntro?: () => void; onTutorial?: () => void }) => (
  <div className="settings" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="card settings-card">
      <p className="epitaph">Settings</p>
      <Volume ch="music" label="Music" />
      <Volume ch="sfx" label="Sound effects" />
      {/* replays only from the camp, never in the middle of a run */}
      {onIntro && onTutorial && (
        <div className="settings-actions">
          <button className="btn" onClick={onIntro}>Replay the intro</button>
          <button className="btn" onClick={onTutorial}>Replay the tutorial</button>
        </div>
      )}
      <div className="settings-actions">
        <button className="btn btn-share" onClick={onClose}>Done</button>
      </div>
    </section>
  </div>
);
