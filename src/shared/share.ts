// The comment a player can choose to post. Built from game state only (never
// free text) and spoiler-free: no path, no pit positions.
import { CANDLES_PER_DAY, difficultyOf } from './board';
import type { MeDto } from './api';
import { pioneerTitle } from './pioneer';

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

/** Plain text and standard punctuation only: it must render in any Reddit font. */
export const shareText = (day: number, me: MeDto): string => {
  const head = `**Here Lies** · Day ${day} · ${difficultyOf(day).name}`;
  const arrow = me.myArrow
    ? me.myArrow.truthful
      ? ` My arrow told the truth${me.myArrow.saved ? ` and saved ${me.myArrow.saved}` : ''}.`
      : ` My arrow lied${me.myArrow.fooled ? ` and fooled ${me.myArrow.fooled}` : ''}.`
    : '';
  if (me.crossed) {
    const lost = CANDLES_PER_DAY - me.candles;
    const how = lost === 0 ? 'without a single fall' : `after falling ${lost === 1 ? 'once' : `${lost} times`}`;
    const streak = me.streak > 1 ? ` · ${me.streak}-day streak` : '';
    const pioneer = me.pioneer !== null ? `\n\nPioneer **${me.pioneer}%** · ${pioneerTitle(me.pioneer)}${streak}` : '';
    return `${head}\n\nCrossed the dark **${me.rank ? ordinal(me.rank) : ''}**, ${how}, in ${me.steps ?? '?'} steps.${arrow}${pioneer}`;
  }
  return `${head}\n\nThe dark took all ${CANDLES_PER_DAY} of my candles.${arrow || ' Watch your step.'}`;
};

export const canShare = (me: MeDto): boolean => me.crossed || me.candles <= 0;
