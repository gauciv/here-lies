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

export const shareText = (day: number, me: MeDto): string => {
  const head = `**Here Lies** · Day ${day} · ${difficultyOf(day).name}`;
  const candles = '▮'.repeat(me.candles) + '▯'.repeat(Math.max(0, CANDLES_PER_DAY - me.candles));
  if (me.crossed) {
    const lost = CANDLES_PER_DAY - me.candles;
    const how = lost === 0 ? 'without a single fall' : `after falling ${lost === 1 ? 'once' : `${lost} times`}`;
    const streak = me.streak > 1 ? ` · ${me.streak}-day streak` : '';
    const pioneer = me.pioneer !== null ? `\n\nPioneer **${me.pioneer}%** · ${pioneerTitle(me.pioneer)}` : '';
    return `${head}\n\nCrossed the dark **${me.rank ? ordinal(me.rank) : ''}**, ${how}, in ${me.steps ?? '?'} steps. ${candles}${streak}${pioneer}`;
  }
  return `${head}\n\nThe dark took me ${CANDLES_PER_DAY} times. ${candles} My last words are still down there. Trust them, or don't.`;
};

export const canShare = (me: MeDto): boolean => me.crossed || me.candles <= 0;
