import { context, reddit, redis } from '@devvit/web/server';
import { dayNumber } from '../../shared/board';

export type PostData = { day: number };

export const isPostData = (v: unknown): v is PostData =>
  typeof v === 'object' && v !== null && 'day' in v && Number.isInteger(v.day);

/** The day a post plays. Posts created before postData existed fall back to today. */
export const postDay = (): number => (isPostData(context.postData) ? context.postData.day : dayNumber());

const dateLabel = (day: number): string => {
  const d = new Date(Date.UTC(2026, 10, 21) + (day - 1) * 86_400_000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** Create the crossing post for a day. Returns null if one already exists. */
export const createDailyPost = async (day: number = dayNumber(), force = false) => {
  const sub = context.subredditName ?? 'unknown';
  const lock = `posted:${sub}:${day}`;
  if (!force && (await redis.get(lock))) return null;
  const post = await reddit.submitCustomPost({
    title: `Here Lies · Day ${day} · ${dateLabel(day)}`,
    postData: { day },
    textFallback: { text: `Here Lies, day ${day}: cross the dark, read the graves, leave your last words.` },
  });
  await redis.set(lock, post.id);
  return post;
};
