import type { Cell } from './board';
import type { EpitaphId } from './epitaphs';

export type Vote = 'honest' | 'liar';

export type EpitaphDto = {
  id: string;
  user: string;
  text: EpitaphId;
  step: number;
  at: number;
  honest: number;
  liar: number;
  myVote: Vote | null;
};

/** One pit that has claimed at least one wanderer today. */
export type GraveDto = {
  i: number;
  falls: number;
  /** most trusted carved epitaph on this grave, if any */
  top: EpitaphDto | null;
  carved: number;
  mine: boolean;
};

export type DayDto = {
  day: number;
  fallen: number;
  crossed: number;
};

export type MeDto = {
  username: string;
  candles: number;
  crossed: boolean;
  rank: number | null;
  steps: number | null;
  revealed: number[];
  /** a fall waiting for last words (cell index) */
  uncarved: number | null;
  streak: number;
  /** already posted today's result as a comment */
  shared: boolean;
  /** % of pits still unmapped by others when you crossed (null until crossed) */
  pioneer: number | null;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  day: DayDto;
  graves: GraveDto[];
  me: MeDto;
};

export type RunRequest = { day: number; path: Cell[] };

export type FallResponse = { type: 'fall'; me: MeDto; grave: GraveDto; day: DayDto };
export type CrossResponse = { type: 'cross'; me: MeDto; day: DayDto };

export type CarveRequest = { day: number; i: number; text: EpitaphId };
export type CarveResponse = { type: 'carve'; grave: GraveDto; me: MeDto };

export type VoteRequest = { day: number; id: string; vote: Vote };
export type VoteResponse = { type: 'vote'; epitaph: EpitaphDto; grave: GraveDto };

export type GraveResponse = { type: 'grave'; grave: GraveDto; epitaphs: EpitaphDto[] };

export type ShareResponse = { type: 'share'; me: MeDto };
export type JoinResponse = { type: 'join' };

export type ErrorResponse = { status: 'error'; message: string };
