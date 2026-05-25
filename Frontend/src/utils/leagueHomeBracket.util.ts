import type { BracketScope } from '@/api/leagues';
import type { Game } from '@/types';
import { buildLeagueBracketSchedulePath } from '@/utils/leagueBracketScheduleDeepLink.util';

export function leagueSeasonIdFromLeagueGame(game: Game): string | null {
  const fromParent = game.parentId ?? game.parent?.id;
  if (fromParent) return fromParent;
  return game.leagueSeason?.id ?? null;
}

export function isBracketLeagueGame(game: Game): boolean {
  const round = game.leagueRound;
  if (!round || (round.roundType ?? 'REGULAR') !== 'PLAYOFF') return false;
  if (round.playoffFormat && round.playoffFormat !== 'BRACKET') return false;
  return true;
}

export function bracketScopeForLeagueGame(game: Game): BracketScope {
  if (game.leagueRound?.bracketScope === 'CROSS_GROUP') return 'CROSS_GROUP';
  if (game.leagueRound?.bracketScope === 'PER_GROUP') return 'PER_GROUP';
  return !game.leagueGroupId && !game.leagueGroup ? 'CROSS_GROUP' : 'PER_GROUP';
}

export function buildLeagueHomeGameBracketPath(game: Game): string | null {
  const seasonId = leagueSeasonIdFromLeagueGame(game);
  if (!seasonId || !isBracketLeagueGame(game)) return null;
  const roundId = game.leagueRound?.id ?? game.leagueRoundId ?? null;
  return buildLeagueBracketSchedulePath(seasonId, {
    roundId,
    groupId: game.leagueGroupId ?? game.leagueGroup?.id ?? null,
    bracketScope: bracketScopeForLeagueGame(game),
  });
}

export function hubHasBracketLeagueGames(games: readonly Game[], hubId: string): boolean {
  return games.some(
    (g) => g.entityType === 'LEAGUE' && leagueSeasonIdFromLeagueGame(g) === hubId && isBracketLeagueGame(g)
  );
}

export function pickLatestBracketHubGame(games: readonly Game[], hubId: string): Game | null {
  const bracketGames = games.filter(
    (g) => g.entityType === 'LEAGUE' && leagueSeasonIdFromLeagueGame(g) === hubId && isBracketLeagueGame(g)
  );
  if (bracketGames.length === 0) return null;
  return [...bracketGames].sort((a, b) => {
    const ra = a.leagueRound?.orderIndex ?? 0;
    const rb = b.leagueRound?.orderIndex ?? 0;
    if (ra !== rb) return rb - ra;
    return b.id.localeCompare(a.id);
  })[0] ?? null;
}

export function buildLeagueHomeHubBracketPath(games: readonly Game[], hubId: string): string | null {
  const game = pickLatestBracketHubGame(games, hubId);
  return game ? buildLeagueHomeGameBracketPath(game) : null;
}

export type LeagueHomeBracketRowContext = {
  isBracket: boolean;
  isSeasonPlayoff: boolean;
  roundIndex: number | null;
  groupName: string | null;
  urgency: 'PLAY_IN' | 'KNOCKOUT' | null;
};

export function getLeagueHomeBracketUrgency(game: Game): 'PLAY_IN' | 'KNOCKOUT' | null {
  if (!isBracketLeagueGame(game)) return null;
  const slotKind = game.bracketSlot?.slotKind;
  if (slotKind === 'PLAY_IN') return 'PLAY_IN';
  if (
    slotKind === 'MAIN' ||
    slotKind === 'THIRD_PLACE' ||
    slotKind === 'CONSOLATION' ||
    slotKind === 'LOSERS' ||
    slotKind === 'GRAND_FINAL'
  ) {
    return 'KNOCKOUT';
  }
  return null;
}

export function getLeagueHomeBracketRowContext(game: Game): LeagueHomeBracketRowContext | null {
  if (!isBracketLeagueGame(game)) return null;
  const scope = bracketScopeForLeagueGame(game);
  const orderIndex = game.leagueRound?.orderIndex;
  return {
    isBracket: true,
    isSeasonPlayoff: scope === 'CROSS_GROUP',
    roundIndex: typeof orderIndex === 'number' ? orderIndex : null,
    groupName: game.leagueGroup?.name ?? null,
    urgency: getLeagueHomeBracketUrgency(game),
  };
}
