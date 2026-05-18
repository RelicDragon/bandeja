import type { TFunction } from 'i18next';
import type { Game } from '@/types';

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

export function getLeagueGameHeaderParts(game: Game, t: TFunction): LeagueGameHeaderParts | null {
  if (game.entityType !== 'LEAGUE' || !game.leagueRound || !game.parent?.leagueSeason?.league?.name) {
    return null;
  }

  return {
    kind: 'league',
    leagueName: game.parent.leagueSeason.league.name,
    seasonName: game.parent.leagueSeason.game?.name,
    groupName: game.leagueGroup?.name,
    groupColor: game.leagueGroup?.color ?? undefined,
    roundLabel: `${t('gameDetails.round')} ${game.leagueRound.orderIndex + 1}`,
  };
}

export function getLeagueSeasonHeaderParts(game: Game): LeagueSeasonHeaderParts | null {
  if (game.entityType !== 'LEAGUE_SEASON' || !game.leagueSeason?.league?.name) {
    return null;
  }

  return {
    kind: 'leagueSeason',
    leagueName: game.leagueSeason.league.name,
    seasonName: game.name ?? undefined,
  };
}

export function getLeagueGameHeaderTitle(game: Game, t: TFunction): string | null {
  const parts = getLeagueGameHeaderParts(game, t);
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

export function getLeagueSeasonHeaderTitle(game: Game): string | null {
  const parts = getLeagueSeasonHeaderParts(game);
  if (!parts) return null;

  return [parts.leagueName, parts.seasonName].filter(Boolean).join(' · ');
}

export function getGameHeaderTitle(game: Game, t: TFunction): string {
  return (
    getLeagueGameHeaderTitle(game, t) ??
    getLeagueSeasonHeaderTitle(game) ??
    game.name?.trim() ??
    game.club?.name ??
    `${game.gameType} Game`
  );
}
