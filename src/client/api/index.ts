import { httpApi } from './http';
import type { GameApi } from './types';

const isLocalPreview = (): boolean => ['localhost', '127.0.0.1'].includes(window.location.hostname);

/** Real Devvit server on reddit.com; seeded in-memory engine on localhost. */
export const loadApi = async (): Promise<GameApi> =>
  isLocalPreview() ? (await import('./local')).localApi : httpApi;

export type { GameApi };
