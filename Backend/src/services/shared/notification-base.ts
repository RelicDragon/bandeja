import { convertMentionsToPlaintext } from '../../utils/parseMentions';
import { formatDateInTimezone, getDateLabelInTimezone, getShortDayOfWeek, getUserTimezoneFromCityId } from '../user-timezone.service';
import { formatDuration, escapeMarkdown } from '../telegram/utils';
import { t } from '../../utils/translations';
import { config } from '../../config/env';
import { Sport } from '@prisma/client';
import { resolveSport } from '../../sport/sportRegistry';
import { resolveUserSportSnapshot } from '../user/userSportProfile.service';
import { appendTelegramGameScheduleExtras } from './notificationSport';
import { formatStoryReplyNotificationBody, hasStoryReplyPayload } from '../chat/storyReplySanitize';

export interface GameInfo {
  id: string;
  startTime: Date | string;
  endTime: Date | string;
  timeIsSet?: boolean | null;
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
  timeIsSet: boolean;
  gameName?: string;
  description?: string;
  entityType?: string;
}

export function resolveGameClubPlace(
  game: Pick<GameInfo, 'court' | 'club'>,
  lang: string,
): string {
  const name = game.court?.club?.name || game.club?.name;
  if (name) return name;
  const key = 'games.clubNotSet';
  const label = t(key, lang);
  return label !== key ? label : 'Club is not set';
}

export function formatGameScheduleLine(
  gameInfo: FormattedGameInfo,
  options: { includeDuration?: boolean } = {},
): string {
  if (gameInfo.timeIsSet === false) {
    return gameInfo.shortDate;
  }
  const parts = [gameInfo.shortDayOfWeek, gameInfo.shortDate, gameInfo.startTime].filter(Boolean);
  let line = parts.join(' ').trim();
  if (options.includeDuration !== false && gameInfo.duration) {
    line = line ? `${line} (${gameInfo.duration})` : `(${gameInfo.duration})`;
  }
  return line;
}

export function formatGameContextHeader(
  gameInfo: FormattedGameInfo,
  options: { includeDuration?: boolean } = {},
): string {
  const schedule = formatGameScheduleLine(gameInfo, options);
  return [gameInfo.place, schedule].filter(Boolean).join(' ').trim();
}

export function getEntityTypeLabel(entityType: string | undefined, lang: string): string {
  if (!entityType || entityType === 'GAME') return '';
  return t(`games.entityTypes.${entityType}`, lang) || entityType;
}

const SHOW_ENTITY_KEYS: Record<string, string> = {
  TOURNAMENT: 'telegram.showTournament',
  LEAGUE: 'telegram.showLeague',
  LEAGUE_SEASON: 'telegram.showLeagueSeason',
  TRAINING: 'telegram.showTraining',
  BAR: 'telegram.showBar',
};

export function getShowEntityButtonText(entityType: string | undefined, lang: string): string {
  if (!entityType || entityType === 'GAME') return t('telegram.showGame', lang);
  const key = SHOW_ENTITY_KEYS[entityType];
  return key ? (t(key, lang) !== key ? t(key, lang) : t('telegram.showGame', lang)) : t('telegram.showGame', lang);
}

export async function formatGameInfo(
  game: GameInfo,
  timezone: string,
  lang: string
): Promise<FormattedGameInfo> {
  if (!game) {
    throw new Error('Game is required for formatting');
  }
  const timeIsSet = game.timeIsSet !== false;
  const place = resolveGameClubPlace(game, lang);

  if (!timeIsSet) {
    const datetimeNotSetKey = 'games.datetimeNotSet';
    const datetimeNotSet =
      t(datetimeNotSetKey, lang) !== datetimeNotSetKey ? t(datetimeNotSetKey, lang) : 'Time is not set yet';
    return {
      place,
      shortDate: datetimeNotSet,
      shortDayOfWeek: '',
      startTime: '',
      duration: '',
      timeIsSet: false,
      gameName: game.name || undefined,
      description: game.description || undefined,
      entityType: game.entityType,
    };
  }

  if (!game.startTime || !game.endTime) {
    throw new Error('Game startTime and endTime are required');
  }

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
    timeIsSet: true,
    gameName: game.name || undefined,
    description: game.description || undefined,
    entityType: game.entityType,
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

export const BUG_NOTIFICATION_TITLE_MAX_LENGTH = 50;

export function truncateBugNotificationTitle(text: string | null | undefined): string {
  const normalized = (text || 'Bug').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Bug';
  return normalized.substring(0, BUG_NOTIFICATION_TITLE_MAX_LENGTH);
}

export interface GameTextOptions {
  includeParticipants?: boolean;
  includeLink?: boolean;
  escapeMarkdown?: boolean;
  existingGameInfo?: FormattedGameInfo;
  primarySport?: string | null;
}

export interface GameWithParticipants extends GameInfo {
  sport?: string | null;
  playersPerMatch?: number | null;
  participants?: Array<{
    status?: string;
    role?: string;
    user?: {
      firstName?: string | null;
      lastName?: string | null;
      level?: number | null;
      reliability?: number | null;
      gamesPlayed?: number | null;
      gamesWon?: number | null;
      sportProfiles?: Array<{ sport: Sport; level: number; reliability: number; gamesPlayed: number; gamesWon: number }>;
    };
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
  const {
    includeParticipants = true,
    includeLink = false,
    escapeMarkdown: shouldEscape = false,
    existingGameInfo,
    primarySport,
  } = options;
  
  const gameInfo = existingGameInfo ?? await formatGameInfo(game, timezone, lang);
  const clubName = resolveGameClubPlace(game, lang);
  const courtName = game.court?.name ? ` • ${game.court.name}` : '';
  
  const playingParticipants = game.participants?.filter((p: any) => p.status === 'PLAYING') || [];
  const participantsCount = game.entityType === 'BAR'
    ? `${playingParticipants.length}`
    : `${playingParticipants.length}/${game.maxParticipants || 0}`;
  const availableSlots = (game.maxParticipants || 0) - playingParticipants.length;

  let escapeFn: (text: string) => string;
  if (shouldEscape) {
    escapeFn = escapeMarkdown;
  } else {
    escapeFn = (text: string) => text;
  }

  const entityTypeLabel = t(`games.entityTypes.${game.entityType}`, lang);
  const organizer = game.entityType === 'TRAINING'
    ? ((game as any).trainerId ? game.participants?.find((p: any) => p.userId === (game as any).trainerId) : null) || game.participants?.find((p: any) => p.role === 'OWNER')
    : game.participants?.find((p: any) => p.role === 'OWNER');
  const gameSport = resolveSport(game.sport ?? Sport.PADEL);
  const ownerName = organizer?.user ? formatUserName(organizer.user) : null;
  const ownerLevel = organizer?.user
    ? resolveUserSportSnapshot(organizer.user as Parameters<typeof resolveUserSportSnapshot>[0], gameSport).level
    : null;

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
  
  const scheduleLine = formatGameScheduleLine(gameInfo);
  text += `📅 ${escapeFn(scheduleLine)}\n`;
  const locationLine = appendTelegramGameScheduleExtras(
    `📍 ${escapeFn(clubName)}${courtName ? escapeFn(courtName) : ''}`,
    game,
    primarySport,
    lang,
    escapeFn,
  );
  text += `${locationLine}\n`;
  
  if (includeParticipants) {
    text += `👥 ${participantsCount}`;
    if (availableSlots > 0) {
      const slotsText = getSlotsText(availableSlots, lang);
      text += ` (${availableSlots} ${escapeFn(slotsText)})`;
    }
    text += '\n';
    
    if (playingParticipants.length > 1) {
      const levels = playingParticipants
        .map((p: any) =>
          p.user
            ? resolveUserSportSnapshot(
                p.user as Parameters<typeof resolveUserSportSnapshot>[0],
                gameSport,
              ).level
            : null,
        )
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
    const viewGameText = t('telegram.viewGame', lang);
    text += `🔗 ${escapeFn(viewGameText)}: ${config.frontendUrl}/games/${game.id}\n`;
  }

  return text.trim();
}

export function formatChatNotificationMessageBody(
  message: {
    content?: string | null;
    messageType?: string;
    mediaUrls?: string[];
    audioDurationMs?: number | null;
    videoDurationMs?: number | null;
    storyReply?: unknown;
  },
  lang = 'en'
): string {
  if (hasStoryReplyPayload(message.storyReply)) {
    return formatStoryReplyNotificationBody(message.content, lang);
  }

  if (message.messageType === 'VOICE' && message.audioDurationMs != null) {
    const totalSec = Math.floor(message.audioDurationMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `🎤 Voice message (${mm}:${ss.toString().padStart(2, '0')})`;
  }
  if (message.messageType === 'VIDEO' && message.videoDurationMs != null) {
    const totalSec = Math.floor(message.videoDurationMs / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `🎬 Video (${mm}:${ss.toString().padStart(2, '0')})`;
  }
  if (message.content?.trim()) return convertMentionsToPlaintext(message.content);
  if (message.mediaUrls && message.mediaUrls.length > 0) return '[Media]';
  return '';
}

