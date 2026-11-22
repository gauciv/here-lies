import { context } from '@devvit/web/client';

/** The subreddit the post lives in, or null in the local preview (no Reddit context). */
export const subredditName = (): string | null => {
  try {
    return context.subredditName ?? null;
  } catch {
    return null;
  }
};
