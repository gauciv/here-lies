// Pioneer score: how much of the day's danger was still unmapped by other
// players when you crossed. Rewards crossing early instead of waiting for the
// board to fill with graves.

export type PioneerTitle = 'Trailblazer' | 'Pathfinder' | 'Wayfarer' | 'Grave-walker';

export const pioneerTitle = (score: number): PioneerTitle =>
  score >= 90 ? 'Trailblazer' : score >= 60 ? 'Pathfinder' : score >= 30 ? 'Wayfarer' : 'Grave-walker';

/**
 * @param pits total pits on the board
 * @param seeded pits pre-marked by forgotten graves (known to everyone, not counted)
 * @param markedByOthers pits other real players had already fallen into
 */
export const pioneerScore = (pits: number, seeded: number, markedByOthers: number): number => {
  const open = Math.max(1, pits - seeded);
  return Math.max(0, Math.min(100, Math.round(100 * (1 - markedByOthers / open))));
};

export type Flair = { text: string; backgroundColor: string; textColor: 'dark' | 'light' };

const FLAIR_COLORS: Record<PioneerTitle, Omit<Flair, 'text'>> = {
  Trailblazer: { backgroundColor: '#f09a3e', textColor: 'dark' },
  Pathfinder: { backgroundColor: '#d3bfa9', textColor: 'dark' },
  Wayfarer: { backgroundColor: '#775c55', textColor: 'light' },
  'Grave-walker': { backgroundColor: '#483b3a', textColor: 'light' },
};

/** Subreddit flair for a crossing. Reddit flair text can't contain commas. */
export const pioneerFlair = (day: number, score: number): Flair => {
  const title = pioneerTitle(score);
  return { text: `${title} · Here Lies day ${day}`, ...FLAIR_COLORS[title] };
};
