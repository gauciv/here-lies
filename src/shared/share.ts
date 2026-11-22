// Sharing a result makes a Reddit post: the player's own caption (editable,
// spoiler-free by default) above a game card drawn from the data below. Built
// from game state only: no path, no pit positions.
import { CANDLES_PER_DAY, difficultyOf, generateBoard } from './board';
import type { MeDto } from './api';
import { formatTime, type StandingTitle } from './pioneer';

/** postData of a result post: the post renders it as a card instead of the camp. */
export type ResultPost = {
  kind: 'result';
  /** the day it was played, so the post can also open that day's room */
  day: number;
  user: string;
  room: string;
  tier: string;
  crossed: boolean;
  time: number | null;
  percent: number | null;
  title: StandingTitle | null;
  total: number | null;
  streak: number;
};

export const isResultPost = (v: unknown): v is ResultPost =>
  typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'result' && 'day' in v && Number.isInteger(v.day);

export const resultPost = (day: number, me: MeDto): ResultPost => ({
  kind: 'result',
  day,
  user: me.username,
  room: generateBoard(day).name,
  tier: difficultyOf(day).name,
  crossed: me.crossed,
  time: me.time,
  percent: me.standing?.percent ?? null,
  title: me.standing?.title ?? null,
  total: me.standing?.total ?? null,
  streak: me.streak,
});

/** A caption to start from. Plain text that works as a post title in any font. */
export const defaultCaption = (day: number, me: MeDto): string => {
  const room = generateBoard(day).name;
  if (me.crossed && me.time !== null) {
    const st = me.standing;
    const standing = !st ? '' : st.percent <= 50 && st.total > 1 ? ` as a ${st.title}, top ${st.percent}% today` : ` as a ${st.title}`;
    return `I crossed ${room} in ${formatTime(me.time)}${standing}. Here Lies, day ${day}.`;
  }
  return `The dark took all ${CANDLES_PER_DAY} of my candles in ${room}. Here Lies, day ${day}.`;
};

/** Post titles are plain text, at most 300 characters. */
export const cleanCaption = (raw: unknown, fallback: string): string => {
  const text = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, 300);
};

export const canShare = (me: MeDto): boolean => me.crossed || me.candles <= 0;
