import type { ColorKey } from '../engine/palette';

export const CANDLE_LIT = ['..y..', '.yWy.', '..o..', '.bbb.', '.BbB.', '.bbb.', '.bbb.', '.bbb.', 'sssss'] as const;
export const CANDLE_OUT = ['.....', '..g..', '..g..', '.ddd.', '.DdD.', '.ddd.', '.ddd.', '.ddd.', 'sssss'] as const;
export const CANDLE_LEGEND: Record<string, ColorKey> = {
  y: 'warm4', W: 'warm6', o: 'warm5', b: 'bone2', B: 'bone3', d: 'stone6', D: 'stone7', g: 'stone5', s: 'stone4',
};
