import type { Cell } from '../../shared/board';
import type { Direction } from '../../shared/epitaphs';
import type {
  CarveResponse,
  CrossResponse,
  FallResponse,
  JoinResponse,
  FlairResponse,
  ShareResponse,
  SkipResponse,
  StartResponse,
  InitResponse,
  PastDayResponse,
} from '../../shared/api';

export type GameApi = {
  init: () => Promise<InitResponse>;
  pastDay: (day: number) => Promise<PastDayResponse>;
  fall: (day: number, path: Cell[]) => Promise<FallResponse>;
  cross: (day: number, path: Cell[]) => Promise<CrossResponse>;
  carve: (day: number, i: number, arrow: Direction) => Promise<CarveResponse>;
  skip: (day: number, i: number) => Promise<SkipResponse>;
  start: (day: number) => Promise<StartResponse>;
  share: (day: number, caption: string) => Promise<ShareResponse>;
  join: () => Promise<JoinResponse>;
  flair: (day: number) => Promise<FlairResponse>;
};
