// Last words are chosen from fixed templates: no free text means nothing to
// moderate, and every line can be true or a lie depending on where it is carved.

export const EPITAPHS = [
  'Safe ahead.',
  'Pit ahead.',
  'Go left.',
  'Go right.',
  'Go around.',
  'Turn back.',
  'Trust the numbers.',
  'The numbers lie.',
  'Trust the graves.',
  "Don't.",
  'So close.',
  'I was sure.',
] as const;

export type EpitaphId = number;

/** Author id of the dungeon's nameless dead, seeded so no day starts empty. */
export const FORGOTTEN = '~forgotten';
export const isForgotten = (user: string): boolean => user === FORGOTTEN;

export const epitaphText = (id: EpitaphId): string => EPITAPHS[id] ?? '…';

export const isEpitaphId = (v: unknown): v is EpitaphId =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < EPITAPHS.length;

export type Verdict = 'trusted' | 'liar' | 'disputed' | 'unjudged';

export const verdictOf = (honest: number, liar: number): Verdict => {
  if (honest + liar < 3) return 'unjudged';
  if (liar > honest * 1.5) return 'liar';
  if (honest > liar * 2) return 'trusted';
  return 'disputed';
};
