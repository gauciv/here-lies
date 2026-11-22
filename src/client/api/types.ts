import type { Cell } from '../../shared/board';
import type { Direction } from '../../shared/epitaphs';
import type {
  CarveResponse,
  CrossResponse,
  FallResponse,
  GraveResponse,
  JoinResponse,
  FlairResponse,
  ShareResponse,
  InitResponse,
  Vote,
  VoteResponse,
} from '../../shared/api';

export type GameApi = {
  init: () => Promise<InitResponse>;
  fall: (day: number, path: Cell[]) => Promise<FallResponse>;
  cross: (day: number, path: Cell[]) => Promise<CrossResponse>;
  carve: (day: number, i: number, arrow: Direction) => Promise<CarveResponse>;
  vote: (day: number, id: string, vote: Vote) => Promise<VoteResponse>;
  grave: (day: number, i: number) => Promise<GraveResponse>;
  share: (day: number) => Promise<ShareResponse>;
  join: () => Promise<JoinResponse>;
  flair: (day: number) => Promise<FlairResponse>;
};
