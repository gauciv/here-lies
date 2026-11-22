import type { ColorKey } from '../engine/palette';

// ── candle: wax with drips in a brass dish; flame on top (7 wide, 14 tall) ──
const BODY = ['.dbbbd.', '.Bbbbbd', '.Bbbbb.', '.Bbbbbd', '.Bbbbb.', '.Bbbbbb', '.Bbbbbb', 'mmmmmmm', '.nnnnn.'] as const;
const top = (rows: readonly string[]): readonly string[] => [...rows, ...BODY];

/** two flicker frames of a lit candle */
export const CANDLE_LIT: readonly (readonly string[])[] = [
  top(['...y...', '..yry..', '..yWy..', '..rWr..', '...k...']),
  top(['..y....', '...yy..', '..yry..', '..rWr..', '...k...']),
];
/** going out: the flame shrinks, gutters, and leaves a curl of smoke */
export const CANDLE_DYING: readonly (readonly string[])[] = [
  top(['.......', '...y...', '..yry..', '..rWr..', '...k...']),
  top(['.......', '.......', '...y...', '..yry..', '...k...']),
  top(['.......', '.......', '.......', '...r...', '...k...']),
  top(['.......', '...g...', '...g...', '....g..', '...k...']),
  top(['...g...', '..g....', '...g...', '.......', '...k...']),
  top(['..g....', '.......', '.......', '.......', '...k...']),
];
export const CANDLE_OUT = top(['.......', '.......', '.......', '.......', '...k...']);

export const CANDLE_LEGEND: Record<string, ColorKey> = {
  y: 'warm4', r: 'warm5', W: 'warm6', k: 'ink', g: 'stone7',
  B: 'bone3', b: 'bone2', d: 'bone1', m: 'warm3', n: 'warm2',
};
export const CANDLE_OUT_LEGEND: Record<string, ColorKey> = {
  ...CANDLE_LEGEND, B: 'bone1', b: 'pst3', d: 'pst2',
};

export const SPEAKER_ON = ['...k....', '..kk.y..', 'kkkk..y.', 'kkkk.y.y', 'kkkk.y.y', 'kkkk..y.', '..kk.y..', '...k....'] as const;
export const SPEAKER_OFF = ['...k....', '..kk....', 'kkkk.r.r', 'kkkk..r.', 'kkkk..r.', 'kkkk.r.r', '..kk....', '...k....'] as const;
export const SPEAKER_LEGEND: Record<string, ColorKey> = { k: 'bone2', y: 'warm4', r: 'red2' };
