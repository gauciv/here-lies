import { dayNumber, type Board } from '../../shared/board';
import { arrowIsTrue } from '../../shared/epitaphs';
import type { GraveDto, MeDto } from '../../shared/api';

/**
 * The full answer (every pit, every arrow's verdict) unlocks only once a day is
 * over, so nobody can screenshot today's room for people who haven't played yet.
 */
export const isDayOver = (day: number): boolean => day < dayNumber();

/**
 * Whether a slab's arrow told the truth, if this viewer may know yet: always for
 * their own arrow once their run is over (they know where they fell), and for
 * everyone else's only once the day is over. null = not yet.
 */
export const verdictFor = (board: Board, grave: GraveDto, me: MeDto, runOver: boolean): boolean | null => {
  const top = grave.top;
  if (!top || !runOver) return null;
  const own = top.user === me.username && me.myArrow?.stone === grave.i;
  return isDayOver(board.day) || own ? arrowIsTrue(board, grave.i, top.arrow) : null;
};
