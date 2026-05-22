import type { Game } from '@/types';
import {
  getClubTimezone,
  getUserTimezone,
  isScheduledDateTodayOrYesterday,
} from '@/utils/gameTimeDisplay';

export function isStalePastScheduledGame(game: Game): boolean {
  if (game.entityType === 'LEAGUE_SEASON') return false;
  if (game.timeIsSet === false) return false;
  if (new Date(game.startTime).getTime() >= Date.now()) return false;
  const tz = getClubTimezone(game) ?? getUserTimezone();
  if (isScheduledDateTodayOrYesterday(game.startTime, tz)) return false;
  if (game.status === 'ANNOUNCED') return true;
  if (game.status === 'STARTED') return true;
  return false;
}
