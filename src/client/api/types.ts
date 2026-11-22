import type { Cell } from '../../shared/board';
import type { Direction } from '../../shared/epitaphs';
import type {
  CarveResponse,
  CrossResponse,
  FallResponse,
  JoinResponse,
  FlairResponse,
  ShareResponse,
  InitResponse,
} from '../../shared/api';

export type GameApi = {
  init: () => Promise<InitResponse>;
  fall: (day: number, path: Cell[]) => Promise<FallResponse>;
  cross: (day: number, path: Cell[]) => Promise<CrossResponse>;
  carve: (day: number, i: number, arrow: Direction) => Promise<CarveResponse>;
  share: (day: number) => Promise<ShareResponse>;
  join: () => Promise<JoinResponse>;
  flair: (day: number) => Promise<FlairResponse>;
};
