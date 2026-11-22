import { CANDLES_PER_DAY, difficultyOf } from '../../shared/board';
import { dateLabel } from './format';
import type { DayDto, MeDto } from '../../shared/api';
import { PixelIcon } from './PixelIcon';
import { CANDLE_LEGEND, CANDLE_LIT, CANDLE_OUT } from './icons';

export const Hud = ({ day, me }: { day: DayDto; me: MeDto }) => (
  <header className="hud">
    <div className="hud-brand">
      <h1 className="logo">Here Lies</h1>
      <span className="hud-sub">
        Day {day.day} · {dateLabel(day.day)} · <b className={`tier tier-${difficultyOf(day.day).name.toLowerCase()}`}>{difficultyOf(day.day).name}</b>
      </span>
    </div>
    <div className="hud-right">
      <div className="candles" aria-label={`${me.candles} of ${CANDLES_PER_DAY} candles left`}>
        {Array.from({ length: CANDLES_PER_DAY }, (_, k) => (
          <PixelIcon key={k} rows={k < me.candles ? CANDLE_LIT : CANDLE_OUT} legend={CANDLE_LEGEND} size={3} />
        ))}
      </div>
      <span className="hud-sub">
        <b className="num-fallen">{day.fallen}</b> fallen · <b className="num-crossed">{day.crossed}</b> crossed
      </span>
    </div>
  </header>
);
