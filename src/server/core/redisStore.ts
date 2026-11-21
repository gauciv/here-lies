import { redis } from '@devvit/web/server';
import type { Store } from '../../shared/engine';

const TTL_SECONDS = 60 * 60 * 24 * 45; // daily keys live ~6 weeks

/** Store backed by Devvit Redis. Daily keys (d:*) get an expiry on write. */
export const redisStore: Store = {
  get: (key) => redis.get(key),
  set: async (key, value) => {
    await redis.set(key, value);
  },
  incrBy: async (key, n) => {
    const v = await redis.incrBy(key, n);
    if (key.startsWith('d:')) await redis.expire(key, TTL_SECONDS);
    return v;
  },
  hGet: (key, field) => redis.hGet(key, field),
  hGetAll: (key) => redis.hGetAll(key),
  hSet: async (key, values) => {
    await redis.hSet(key, values);
    if (key.startsWith('d:')) await redis.expire(key, TTL_SECONDS);
  },
  hSetNX: async (key, field, value) => (await redis.hSetNX(key, field, value)) === 1,
  hIncrBy: (key, field, n) => redis.hIncrBy(key, field, n),
  zAdd: async (key, member, score) => {
    await redis.zAdd(key, { member, score });
    if (key.startsWith('d:')) await redis.expire(key, TTL_SECONDS);
  },
  zIncrBy: (key, member, n) => redis.zIncrBy(key, member, n),
  zTop: async (key, count) => {
    const rows = await redis.zRange(key, 0, count - 1, { by: 'rank', reverse: true });
    return rows.map((r) => r.member);
  },
  zCard: (key) => redis.zCard(key),
};
