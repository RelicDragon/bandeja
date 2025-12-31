import { formatDateInTimezone, getDateLabelInTimezone, getUserTimezoneFromCityId } from '../user-timezone.service';
import { formatDuration } from '../telegram/utils';

export interface GameInfo {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
  court?: { club?: { name: string } } | null;
  club?: { name: string } | null;
  name?: string | null;
  description?: string | null;
  entityType?: string;
}

export interface FormattedGameInfo {
  place: string;
  shortDate: string;
  startTime: string;
  duration: string;
  gameName?: string;
  description?: string;
}

export async function formatGameInfo(
  game: GameInfo,
  timezone: string,
  lang: string
): Promise<FormattedGameInfo> {
  if (!game) {
    throw new Error('Game is required for formatting');
  }
  if (!game.startTime || !game.endTime) {
    throw new Error('Game startTime and endTime are required');
  }
  
  const place = game.court?.club?.name || game.club?.name || 'Unknown location';
  const shortDate = await getDateLabelInTimezone(game.startTime, timezone, lang, false);
  const startTime = await formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);

  return {
    place,
    shortDate,
    startTime,
    duration,
    gameName: game.name || undefined,
    description: game.description || undefined,
  };
}

export async function formatGameInfoForUser(
  game: GameInfo,
  userCityId: string | null,
  lang: string
): Promise<FormattedGameInfo> {
  if (!game) {
    throw new Error('Game is required for formatting');
  }
  const timezone = await getUserTimezoneFromCityId(userCityId);
  return formatGameInfo(game, timezone, lang);
}

export function formatUserName(user: { firstName?: string | null; lastName?: string | null }): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
}

