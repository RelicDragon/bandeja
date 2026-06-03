import type { LucideIcon } from 'lucide-react';
import { Beer, Dumbbell, Gamepad2, Swords, Trophy } from 'lucide-react';
import type { TFunction } from 'i18next';
import type { EntityType, Game } from '@/types';
import type { ResolvedDisplaySettings } from '@/utils/displayPreferences';
import { getClubTimezone, getDateLabelInClubTz, getGameTimeDisplay } from '@/utils/gameTimeDisplay';

export type GameChatListEntityVisual = {
  Icon: LucideIcon;
  iconClass: string;
  ringClass: string;
  badgeClass: string;
};

export function getGameChatListEntityVisual(entityType: EntityType): GameChatListEntityVisual {
  switch (entityType) {
    case 'TOURNAMENT':
      return {
        Icon: Swords,
        iconClass: 'text-red-600 dark:text-red-400',
        ringClass: 'border-red-400/80 dark:border-red-500/70',
        badgeClass: 'bg-red-100/90 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      };
    case 'LEAGUE':
    case 'LEAGUE_SEASON':
      return {
        Icon: Trophy,
        iconClass: 'text-blue-600 dark:text-blue-400',
        ringClass: 'border-blue-400/80 dark:border-blue-500/70',
        badgeClass: 'bg-blue-100/90 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
      };
    case 'TRAINING':
      return {
        Icon: Dumbbell,
        iconClass: 'text-green-600 dark:text-green-400',
        ringClass: 'border-green-400/80 dark:border-green-500/70',
        badgeClass: 'bg-green-100/90 text-green-800 dark:bg-green-900/40 dark:text-green-300',
      };
    case 'BAR':
      return {
        Icon: Beer,
        iconClass: 'text-amber-700 dark:text-amber-400',
        ringClass: 'border-amber-400/80 dark:border-amber-500/70',
        badgeClass: 'bg-amber-100/90 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300',
      };
    default:
      return {
        Icon: Gamepad2,
        iconClass: 'text-primary-600 dark:text-primary-300',
        ringClass: 'border-primary-400/70 dark:border-primary-500/60',
        badgeClass: 'bg-primary-100/90 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200',
      };
  }
}

export function getGameChatListEntityLabel(entityType: EntityType, t: TFunction): string {
  return t(`games.entityTypes.${entityType}`, {
    defaultValue: entityType === 'GAME' ? 'Game' : entityType,
  });
}

export function getGameChatListTitle(game: Game, t: TFunction): string {
  if (game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name) {
    const league = game.parent.leagueSeason.league.name;
    const seasonName = game.parent.leagueSeason.game?.name;
    return seasonName ? `${league} · ${seasonName}` : league;
  }
  if (game.entityType === 'LEAGUE_SEASON' && game.leagueSeason?.league?.name) {
    const league = game.leagueSeason.league.name;
    return game.name ? `${league} · ${game.name}` : league;
  }
  if (game.name?.trim()) return game.name.trim();
  if (
    game.entityType !== 'GAME' &&
    game.entityType !== 'TRAINING' &&
    game.gameType !== 'CLASSIC'
  ) {
    return t(`games.gameTypes.${game.gameType}`, { defaultValue: game.gameType });
  }
  return '';
}

export function gameChatListShowsLeagueTags(game: Game): boolean {
  return (
    game.entityType === 'LEAGUE' &&
    Boolean(game.leagueGroup?.name || game.leagueRound)
  );
}

export function getGameChatListDateTimeBlock(
  game: Game,
  displaySettings: ResolvedDisplaySettings,
  t: TFunction
): { dateLabel: string; timeLabel: string } | null {
  if (game.timeIsSet !== true) return null;

  const clubTz = getClubTimezone(game);
  const dateLabel = clubTz
    ? getDateLabelInClubTz(game.startTime, clubTz, displaySettings, t, { compactWeekday: true })
    : '';
  const timeLabel = getGameTimeDisplay({
    game,
    displaySettings,
    startTime: game.startTime,
    endTime: game.entityType !== 'BAR' ? game.endTime : undefined,
    kind: 'time',
    t,
  }).primaryText;

  if (!dateLabel && !timeLabel) return null;
  return { dateLabel, timeLabel };
}

export function getGameChatListLocationLine(game: Game, t: TFunction): string {
  const clubName = game.court?.club?.name || game.club?.name;
  const courtSuffix = game.court?.name && clubName ? ` · ${game.court.name}` : '';
  if (clubName) return `${clubName}${courtSuffix}`;
  if (game.city?.name) return game.city.name;
  return t('gameDetails.clubNotSet');
}

export function getGameChatListMetaLine(
  game: Game,
  displaySettings: ResolvedDisplaySettings,
  t: TFunction
): string {
  const location = getGameChatListLocationLine(game, t);
  const dt = getGameChatListDateTimeBlock(game, displaySettings, t);
  if (!dt) {
    if (game.timeIsSet !== true) {
      return [t('gameDetails.datetimeNotSet'), location].filter(Boolean).join(' · ');
    }
    return location;
  }
  const parts = [dt.dateLabel, dt.timeLabel, location].filter(Boolean);
  return parts.join(' · ');
}
