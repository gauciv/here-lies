import type { ColorKey } from '../engine/palette';

export const CANDLE_LIT = ['..y..', '.yWy.', '..o..', '.bbb.', '.BbB.', '.bbb.', '.bbb.', '.bbb.', 'sssss'] as const;
export const CANDLE_OUT = ['.....', '..g..', '..g..', '.ddd.', '.DdD.', '.ddd.', '.ddd.', '.ddd.', 'sssss'] as const;
export const CANDLE_LEGEND: Record<string, ColorKey> = {
  y: 'warm4', W: 'warm6', o: 'warm5', b: 'bone2', B: 'bone3', d: 'stone6', D: 'stone7', g: 'stone5', s: 'stone4',
};

export const SPEAKER_ON = ['...k....', '..kk.y..', 'kkkk..y.', 'kkkk.y.y', 'kkkk.y.y', 'kkkk..y.', '..kk.y..', '...k....'] as const;
export const SPEAKER_OFF = ['...k....', '..kk....', 'kkkk.r.r', 'kkkk..r.', 'kkkk..r.', 'kkkk.r.r', '..kk....', '...k....'] as const;
export const SPEAKER_LEGEND: Record<string, ColorKey> = { k: 'bone2', y: 'warm4', r: 'red2' };
