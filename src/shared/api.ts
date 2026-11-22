import type { Cell } from './board';
import type { Direction } from './epitaphs';
import type { Standing } from './pioneer';

/** The single arrow carved on a slab. */
export type EpitaphDto = {
  id: string;
  user: string;
  /** carved arrow: the way they claim to have fallen (may be a lie) */
  arrow: Direction;
  step: number;
  at: number;
  /** walkers it warned off a real pit */
  saved: number;
  /** walkers who fell from its stone while it lied */
  fooled: number;
  /** walkers who have stood on this slab; it crumbles at CRUMBLE_AFTER */
  visits: number;
};

/** A slab on a safe stone: wanderers stepped off it into a pit today. */
export type GraveDto = {
  i: number;
  falls: number;
  /** the slab's one arrow, carved by the first to fall from it */
  top: EpitaphDto | null;
  mine: boolean;
};

export type DayDto = {
  day: number;
  /** today's room, e.g. "The Drowned Gallery" */
  room: string;
  fallen: number;
  crossed: number;
};

/** The arrow this player carved today, and what it did to others. */
export type MyArrowDto = {
  stone: number;
  arrow: Direction;
  truthful: boolean;
  saved: number;
  fooled: number;
  visits: number;
  crumbled: boolean;
  /** still waiting beneath another arrow on its stone */
  waiting: boolean;
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
  /** the pending carving may be skipped (always: carving is never forced) */
  uncarvedSkippable: boolean;
  /** the stone already bears an arrow: the pending carving will wait beneath it */
  uncarvedQueued: boolean;
  /** pits this player has fallen into today (their own hard-won knowledge) */
  fellInto: number[];
  streak: number;
  /** longest crossing streak this player has ever had here */
  bestStreak: number;
  /** already posted today's result as a comment */
  shared: boolean;
  /** when you first stepped into today's room (server clock, ms) */
  startedAt: number | null;
  /** when the run ended: crossed, or the last candle went out */
  endedAt: number | null;
  /** your crossing time in ms (null until crossed) */
  time: number | null;
  /** where that time stands among today's crossers, live */
  standing: Standing | null;
  myArrow: MyArrowDto | null;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  day: DayDto;
  graves: GraveDto[];
  me: MeDto;
};

export type RunRequest = { day: number; path: Cell[] };

export type FallResponse = { type: 'fall'; me: MeDto; grave: GraveDto; day: DayDto; graves: GraveDto[] };
export type CrossResponse = { type: 'cross'; me: MeDto; day: DayDto; graves: GraveDto[] };

export type CarveRequest = { day: number; i: number; arrow: Direction };
export type CarveResponse = { type: 'carve'; grave: GraveDto; me: MeDto };

export type SkipResponse = { type: 'skip'; me: MeDto };
export type StartResponse = { type: 'start'; me: MeDto };
export type ShareResponse = { type: 'share'; me: MeDto; url: string | null };
export type JoinResponse = { type: 'join' };
export type FlairResponse = { type: 'flair'; text: string };

export type ErrorResponse = { status: 'error'; message: string };
