import type { ErrorResponse } from '../../shared/api';
import type { GameApi } from './types';

const isError = (v: unknown): v is ErrorResponse =>
  typeof v === 'object' && v !== null && 'status' in v && v.status === 'error';

const call = async <T>(path: string, body?: unknown): Promise<T> => {
  const res = await fetch(`/api/${path}`, body === undefined
    ? undefined
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok || isError(data)) {
    throw new Error(isError(data) ? data.message : `Request failed (${res.status})`);
  }
  return data as T;
};

export const httpApi: GameApi = {
  init: () => call('init'),
  fall: (day, path) => call('fall', { day, path }),
  cross: (day, path) => call('cross', { day, path }),
  carve: (day, i, text) => call('carve', { day, i, text }),
  vote: (day, id, vote) => call('vote', { day, id, vote }),
  grave: (day, i) => call(`grave?day=${day}&i=${i}`),
  share: (day) => call('share', { day }),
  join: () => call('join', {}),
  flair: (day) => call('flair', { day }),
};
