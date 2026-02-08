import { formatDateInTimezone, getDateLabelInTimezone, getShortDayOfWeek, getUserTimezoneFromCityId } from '../user-timezone.service';
import { formatDuration } from '../telegram/utils';
import { t } from '../../utils/translations';

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
  shortDayOfWeek: string;
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
  const [shortDate, shortDayOfWeek, startTime] = await Promise.all([
    getDateLabelInTimezone(game.startTime, timezone, lang, false),
    getShortDayOfWeek(game.startTime, timezone, lang),
    formatDateInTimezone(game.startTime, 'HH:mm', timezone, lang),
  ]);
  const duration = formatDuration(new Date(game.startTime), new Date(game.endTime), lang);

  return {
    place,
    shortDate,
    shortDayOfWeek,
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

export async function formatGameInfoForUserWithTimezone(
  game: GameInfo,
  userCityId: string | null,
  lang: string
): Promise<{ gameInfo: FormattedGameInfo; timezone: string }> {
  if (!game) {
    throw new Error('Game is required for formatting');
  }
  const timezone = await getUserTimezoneFromCityId(userCityId);
  const gameInfo = await formatGameInfo(game, timezone, lang);
  return { gameInfo, timezone };
}

export function formatUserName(user: { firstName?: string | null; lastName?: string | null }): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
}

export interface GameTextOptions {
  includeParticipants?: boolean;
  includeLink?: boolean;
  escapeMarkdown?: boolean;
  existingGameInfo?: FormattedGameInfo;
}

export interface GameWithParticipants extends GameInfo {
  participants?: Array<{ 
    status?: string;
    role?: string;
    user?: { firstName?: string | null; lastName?: string | null; level?: number | null };
  }>;
  maxParticipants?: number;
  court?: { name?: string; club?: { name: string } } | null;
}

function getSlotsText(count: number, lang: string): string {
  if (count === 1) {
    return t('telegram.slotAvailable', lang);
  }
  
  if (lang === 'ru' || lang === 'sr') {
    const lastDigit = count % 10;
    const lastTwoDigits = count % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
      return t('telegram.slotsAvailable', lang);
    }
    
    if (lastDigit >= 2 && lastDigit <= 4) {
      return t('telegram.slotsAvailablePaucal', lang);
    }
    
    return t('telegram.slotsAvailable', lang);
  }
  
  return t('telegram.slotsAvailable', lang);
}

export async function formatNewGameText(
  game: GameWithParticipants,
  timezone: string,
  lang: string,
  options: GameTextOptions = {}
): Promise<string> {
  const { includeParticipants = true, includeLink = false, escapeMarkdown: shouldEscape = false, existingGameInfo } = options;
  
  const gameInfo = existingGameInfo ?? await formatGameInfo(game, timezone, lang);
  const club = game.court?.club || game.club;
  const clubName = club?.name || 'Unknown location';
  const courtName = game.court?.name ? ` • ${game.court.name}` : '';
  
  const playingParticipants = game.participants?.filter((p: any) => p.status === 'PLAYING') || [];
  const participantsCount = game.entityType === 'BAR'
    ? `${playingParticipants.length}`
    : `${playingParticipants.length}/${game.maxParticipants || 0}`;
  const availableSlots = (game.maxParticipants || 0) - playingParticipants.length;

  let escapeFn: (text: string) => string;
  if (shouldEscape) {
    const { escapeMarkdown } = await import('../telegram/utils');
    escapeFn = escapeMarkdown;
  } else {
    escapeFn = (text: string) => text;
  }

  const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);
  const organizer = game.entityType === 'TRAINING'
    ? ((game as any).trainerId ? game.participants?.find((p: any) => p.userId === (game as any).trainerId) : null) || game.participants?.find((p: any) => p.role === 'OWNER')
    : game.participants?.find((p: any) => p.role === 'OWNER');
  const ownerName = organizer?.user ? formatUserName(organizer.user) : null;
  const ownerLevel = organizer?.user?.level;

  let text = '';
  
  if (game.name) {
    text += `${escapeFn(game.name)}\n`;
  }
  
  if (game.entityType !== 'GAME') {
    text += `🏷️ ${escapeFn(entityTypeLabel)}\n`;
  }

  if (ownerName) {
    const ownerDisplay = ownerLevel !== null && ownerLevel !== undefined
      ? `${escapeFn(ownerName)} (${ownerLevel.toFixed(1)})`
      : escapeFn(ownerName);
    text += `👑 ${escapeFn(t('games.organizer', lang))}: ${ownerDisplay}\n`;
  }
  
  text += `📅 ${escapeFn(gameInfo.shortDayOfWeek)} ${escapeFn(gameInfo.shortDate)} ${escapeFn(gameInfo.startTime)} (${escapeFn(gameInfo.duration)})\n`;
  text += `📍 ${escapeFn(clubName)}${courtName ? escapeFn(courtName) : ''}\n`;
  
  if (includeParticipants) {
    text += `👥 ${participantsCount}`;
    if (availableSlots > 0) {
      const slotsText = getSlotsText(availableSlots, lang);
      text += ` (${availableSlots} ${escapeFn(slotsText)})`;
    }
    text += '\n';
    
    if (playingParticipants.length > 1) {
      const levels = playingParticipants
        .map((p: any) => p.user?.level)
        .filter((level: any): level is number => level !== null && level !== undefined);
      
      if (levels.length > 0) {
        const minLevel = Math.min(...levels);
        const maxLevel = Math.max(...levels);
        const participantsLabel = t('games.participants', lang) || 'Participants';
        const levelLabel = t('games.level', lang) || 'Level';
        text += `⭐ ${escapeFn(participantsLabel)} ${escapeFn(levelLabel.toLowerCase())}: ${minLevel.toFixed(1)} - ${maxLevel.toFixed(1)}\n`;
      }
    }
  }
  
  if (includeLink) {
    const { config } = await import('../../config/env');
    const viewGameText = t('telegram.viewGame', lang);
    text += `🔗 ${escapeFn(viewGameText)}: ${config.frontendUrl}/games/${game.id}\n`;
  }

  return text.trim();
}

