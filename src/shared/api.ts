import type { Cell } from './board';
import type { Direction } from './epitaphs';

export type Vote = 'honest' | 'liar';

export type EpitaphDto = {
  id: string;
  user: string;
  /** carved arrow: the way they claim to have fallen (may be a lie) */
  arrow: Direction;
  step: number;
  at: number;
  honest: number;
  liar: number;
  myVote: Vote | null;
};

/** A slab on a safe stone: wanderers stepped off it into a pit today. */
export type GraveDto = {
  i: number;
  falls: number;
  /** most trusted carved arrow on this slab, if any */
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
  /** a fall waiting for its arrow: the slab's stone index */
  uncarved: number | null;
  /** pits this player has fallen into today (their own hard-won knowledge) */
  fellInto: number[];
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

export type CarveRequest = { day: number; i: number; arrow: Direction };
export type CarveResponse = { type: 'carve'; grave: GraveDto; me: MeDto };

export type VoteRequest = { day: number; id: string; vote: Vote };
export type VoteResponse = { type: 'vote'; epitaph: EpitaphDto; grave: GraveDto };

export type GraveResponse = { type: 'grave'; grave: GraveDto; epitaphs: EpitaphDto[] };

export type ShareResponse = { type: 'share'; me: MeDto };
export type JoinResponse = { type: 'join' };
export type FlairResponse = { type: 'flair'; text: string };

export type ErrorResponse = { status: 'error'; message: string };
