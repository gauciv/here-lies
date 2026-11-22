import { Hono, type Context } from 'hono';
import { context, reddit } from '@devvit/web/server';
import { Engine, GameError } from '../../shared/engine';
import { ANONYMOUS } from '../../shared/epitaphs';
import type { ErrorResponse, FlairResponse, JoinResponse, ShareResponse } from '../../shared/api';
import { redisStore } from '../core/redisStore';
import { postDay } from '../core/post';

const engine = new Engine(redisStore);

export const api = new Hono();

const username = async (): Promise<string> => (await reddit.getCurrentUsername()) ?? ANONYMOUS;

/** For routes that act on a Reddit account: never pass a placeholder to Reddit. */
const requireUser = async (): Promise<string> => {
  const user = await reddit.getCurrentUsername();
  if (!user) throw new GameError('Log in to Reddit first');
  return user;
};

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
    return c.json(await engine.carve(dayFrom(body), await username(), i, body.arrow));
  } catch (e) {
    return fail(c, e);
  }
});


api.post('/skip', async (c) => {
  try {
    const body = await readBody(c);
    const i = Number(body.i);
    if (!Number.isInteger(i)) throw new GameError('Unknown grave');
    return c.json(await engine.skip(dayFrom(body), await username(), i));
  } catch (e) {
    return fail(c, e);
  }
});

// Posting and joining happen only from their own explicit buttons (Devvit user-action rules).
api.post('/share', async (c) => {
  try {
    const body = await readBody(c);
    const day = dayFrom(body);
    const user = await requireUser();
    const { subredditName } = context;
    if (!subredditName) throw new GameError('Open the game from its post');
    // the player's caption becomes the post's title; the post itself renders the result card
    const { title, card } = await engine.claimShare(day, user, body.caption);
    let url: string;
    try {
      const post = await reddit.submitCustomPost({
        subredditName,
        title,
        postData: card,
        runAs: 'USER',
        userGeneratedContent: { text: title },
        textFallback: { text: `${title} (a Here Lies result card)` },
      });
      url = post.url;
    } catch (e) {
      await engine.confirmShare(day, user, false);
      throw e;
    }
    return c.json<ShareResponse>({ type: 'share', me: await engine.confirmShare(day, user, true), url });
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/start', async (c) => {
  try {
    const body = await readBody(c);
    return c.json(await engine.start(dayFrom(body), await requireUser()));
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/join', async (c) => {
  try {
    await requireUser();
    await reddit.subscribeToCurrentSubreddit();
    return c.json<JoinResponse>({ type: 'join' });
  } catch (e) {
    return fail(c, e);
  }
});

api.post('/flair', async (c) => {
  try {
    const body = await readBody(c);
    const day = dayFrom(body);
    const user = await requireUser();
    const { subredditName } = context;
    if (!subredditName) throw new GameError('Open the game from its post');
    const flair = await engine.flairFor(day, user);
    await reddit.setUserFlair({ subredditName, username: user, ...flair });
    return c.json<FlairResponse>({ type: 'flair', text: flair.text });
  } catch (e) {
    return fail(c, e);
  }
});
