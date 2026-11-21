import { dayStartUtc } from '../../shared/board';

export const dateLabel = (day: number): string =>
  new Date(dayStartUtc(day)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
