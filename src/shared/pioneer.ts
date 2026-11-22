// Standing: where your crossing time places you among everyone who crossed the
// same room today. The fastest fifth are Pioneers.

export type StandingTitle = 'Pioneer' | 'Pathfinder' | 'Wayfarer' | 'Grave-walker';

export type Standing = {
  /** 1 = fastest crossing today */
  position: number;
  /** crossers so far today */
  total: number;
  /** "top N%": the share of today's crossers at or ahead of you */
  percent: number;
  title: StandingTitle;
};

export const standingOf = (position: number, total: number): Standing => {
  const t = Math.max(1, total);
  const p = Math.min(Math.max(1, position), t);
  const percent = Math.max(1, Math.ceil((100 * p) / t));
  // the fastest crosser is always a Pioneer, however few have crossed
  const title: StandingTitle = p === 1 || percent <= 20 ? 'Pioneer' : percent <= 50 ? 'Pathfinder' : percent <= 80 ? 'Wayfarer' : 'Grave-walker';
  return { position: p, total: t, percent, title };
};

/** 83456 → "1:23" (and "1:02:03" past an hour). */
export const formatTime = (ms: number): string => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

export type Flair = { text: string; backgroundColor: string; textColor: 'dark' | 'light' };

const FLAIR_COLORS: Record<StandingTitle, Omit<Flair, 'text'>> = {
  Pioneer: { backgroundColor: '#f09a3e', textColor: 'dark' },
  Pathfinder: { backgroundColor: '#d3bfa9', textColor: 'dark' },
  Wayfarer: { backgroundColor: '#775c55', textColor: 'light' },
  'Grave-walker': { backgroundColor: '#483b3a', textColor: 'light' },
};

/** Subreddit flair for a crossing. Reddit flair text can't contain commas. */
export const standingFlair = (day: number, title: StandingTitle): Flair => ({
  text: `${title} · Here Lies day ${day}`,
  ...FLAIR_COLORS[title],
});
