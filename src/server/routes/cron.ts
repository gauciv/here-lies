import { Hono } from 'hono';
import { createDailyPost } from '../core/post';

export const cron = new Hono();

/** Runs at 00:00 UTC: opens a new crossing for the day. */
cron.post('/daily-post', async (c) => {
  try {
    const post = await createDailyPost();
    console.log(post ? `posted day crossing ${post.id}` : 'day crossing already posted');
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error(`daily post failed: ${error}`);
    return c.json({ status: 'error' }, 500);
  }
});
