import { Hono, type Context } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { Engine, GameError } from '../../shared/engine';
import type { ErrorResponse, JoinResponse, ShareResponse } from '../../shared/api';
import { redisStore } from '../core/redisStore';
import { postDay } from '../core/post';

const engine = new Engine(redisStore);

export const api = new Hono();

const username = async (): Promise<string> => (await reddit.getCurrentUsername()) ?? 'anonymous';

const fail = (c: Context, error: unknown) => {
  if (error instanceof GameError) return c.json<ErrorResponse>({ status: 'error', message: error.message }, 400);
  console.error('api error', error);
  return c.json<ErrorResponse>({ status: 'error', message: 'Something went wrong in the dark. Try again.' }, 500);
};

const readBody = async (c: Context): Promise<Record<string, unknown>> => {
  const body: unknown = await c.req.json().catch(() => ({}));
  return typeof body === 'object' && body !== null ? { ...body } : {};
};

/** Every mutation must target the day this post plays. */
const dayFrom = (body: Record<string, unknown>): number => {
  const day = postDay();
  if (body.day !== day) throw new GameError('This crossing has changed. Reload the post.');
  return day;
};

api.get('/init', async (c) => {
  try {
    const { postId } = context;
    if (!postId) throw new GameError('Open the game from its post');
    return c.json(await engine.init(postDay(), await username(), postId));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/fall', async (c) => {
  try {
    const body = await readBody(c);
    return c.json(await engine.fall(dayFrom(body), await username(), body.path));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/cross', async (c) => {
  try {
    const body = await readBody(c);
    return c.json(await engine.cross(dayFrom(body), await username(), body.path));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/carve', async (c) => {
  try {
    const body = await readBody(c);
    const i = Number(body.i);
    if (!Number.isInteger(i)) throw new GameError('Unknown grave');
    return c.json(await engine.carve(dayFrom(body), await username(), i, body.text));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/vote', async (c) => {
  try {
    const body = await readBody(c);
    if (typeof body.id !== 'string') throw new GameError('Unknown epitaph');
    return c.json(await engine.vote(dayFrom(body), await username(), body.id, body.vote));
  } catch (e) {
    return fail(c, e);
  }
});

// Posting and joining happen only from their own explicit buttons (Devvit user-action rules).
api.post('/share', async (c) => {
  try {
    const body = await readBody(c);
    const day = dayFrom(body);
    const user = await username();
    const { postId } = context;
    if (!postId) throw new GameError('Open the game from its post');
    const text = await engine.claimShare(day, user);
    try {
      await reddit.submitComment({ id: postId, text, runAs: 'USER' });
    } catch (e) {
      await engine.confirmShare(day, user, false);
      throw e;
    }
    return c.json<ShareResponse>({ type: 'share', me: await engine.confirmShare(day, user, true) });
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/join', async (c) => {
  try {
    await reddit.subscribeToCurrentSubreddit();
    return c.json<JoinResponse>({ type: 'join' });
  } catch (e) {
    return fail(c, e);
  }
});

api.get('/grave', async (c) => {
  try {
    const day = postDay();
    const i = Number(c.req.query('i'));
    if (!Number.isInteger(i)) throw new GameError('Unknown grave');
    return c.json(await engine.graveDetail(day, await username(), i));
  } catch (e) {
    return fail(c, e);
  }
});
