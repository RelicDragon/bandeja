import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import { resolveDisplayedGameText } from '@/utils/gameText/resolveDisplayedGameText';

export interface LeagueGameHeaderParts {
  kind: 'league';
  leagueName: string;
  seasonName?: string;
  groupName?: string;
  groupColor?: string;
  roundLabel: string;
}

export interface LeagueSeasonHeaderParts {
  kind: 'leagueSeason';
  leagueName: string;
  seasonName?: string;
}

export type StructuredGameHeaderParts = LeagueGameHeaderParts | LeagueSeasonHeaderParts;

export function getLeagueGameHeaderParts(
  game: Game,
  t: TFunction,
  locale?: string | null,
): LeagueGameHeaderParts | null {
  if (game.entityType !== 'LEAGUE' || !game.leagueRound || !game.parent?.leagueSeason?.league?.name) {
    return null;
  }

  const seasonName =
    resolveDisplayedGameText(game.parent.leagueSeason.game, { locale }).name?.trim() || undefined;

  return {
    kind: 'league',
    leagueName: game.parent.leagueSeason.league.name,
    seasonName,
    groupName: game.leagueGroup?.name,
    groupColor: game.leagueGroup?.color ?? undefined,
    roundLabel: `${t('gameDetails.round')} ${game.leagueRound.orderIndex + 1}`,
  };
}

export function getLeagueSeasonHeaderParts(
  game: Game,
  locale?: string | null,
): LeagueSeasonHeaderParts | null {
  if (game.entityType !== 'LEAGUE_SEASON' || !game.leagueSeason?.league?.name) {
    return null;
  }

  const seasonName = resolveDisplayedGameText(game, { locale }).name?.trim() || undefined;

  return {
    kind: 'leagueSeason',
    leagueName: game.leagueSeason.league.name,
    seasonName,
  };
}

export function getLeagueGameHeaderTitle(
  game: Game,
  t: TFunction,
  locale?: string | null,
): string | null {
  const parts = getLeagueGameHeaderParts(game, t, locale);
  if (!parts) return null;

  return [
    parts.leagueName,
    parts.seasonName,
    parts.groupName,
    parts.roundLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function getLeagueSeasonHeaderTitle(
  game: Game,
  locale?: string | null,
): string | null {
  const parts = getLeagueSeasonHeaderParts(game, locale);
  if (!parts) return null;

  return [parts.leagueName, parts.seasonName].filter(Boolean).join(' · ');
}

export function getGameHeaderTitle(
  game: Game,
  t: TFunction,
  locale?: string | null,
): string {
  const displayName = resolveDisplayedGameText(game, { locale }).name?.trim() || null;
  return (
    getLeagueGameHeaderTitle(game, t, locale) ??
    getLeagueSeasonHeaderTitle(game, locale) ??
    displayName ??
    game.club?.name ??
    `${game.gameType} Game`
  );
}
