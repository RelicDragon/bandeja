import { config } from '../../config/env';

export type BracketScopeDto = 'PER_GROUP' | 'CROSS_GROUP';

export function buildLeagueBracketSchedulePath(params: {
  bracketScope?: BracketScopeDto | null;
  leagueGroupId?: string | null;
  roundId?: string | null;
}): string {
  const sp = new URLSearchParams();
  sp.set('tab', 'schedule');
  sp.set('subtab', 'bracket');
  const roundId = params.roundId?.trim();
  if (roundId) {
    sp.set('roundId', roundId);
    sp.set('round', roundId);
  }
  if (params.bracketScope === 'PER_GROUP' && params.leagueGroupId) {
    sp.set('group', params.leagueGroupId);
  }
  return sp.toString();
}

export function buildLeagueBracketScheduleUrl(
  leagueSeasonId: string,
  params: {
    bracketScope?: BracketScopeDto | null;
    leagueGroupId?: string | null;
    roundId?: string | null;
  }
): string {
  const query = buildLeagueBracketSchedulePath(params);
  return `${config.frontendUrl}/games/${leagueSeasonId}?${query}`;
}

export function buildLeagueRoundStartViewUrl(game: {
  id: string;
  parentId?: string | null;
  leagueGroupId?: string | null;
  leagueSeason?: { id?: string } | null;
  leagueRound?: {
    id?: string;
    playoffFormat?: string | null;
    bracketScope?: BracketScopeDto | null;
  } | null;
}): string {
  const leagueSeasonId = game.parentId ?? game.leagueSeason?.id;
  if (!leagueSeasonId) {
    return `${config.frontendUrl}/games/${game.id}`;
  }

  const round = game.leagueRound;
  if (round?.playoffFormat !== 'BRACKET') {
    return `${config.frontendUrl}/games/${game.id}`;
  }

  return buildLeagueBracketScheduleUrl(leagueSeasonId, {
    bracketScope: round.bracketScope ?? 'PER_GROUP',
    leagueGroupId: game.leagueGroupId,
    roundId: round.id,
  });
}

export function leagueBracketPushScheduleExtras(game: {
  id: string;
  parentId?: string | null;
  leagueGroupId?: string | null;
  leagueSeason?: { id?: string } | null;
  leagueRound?: {
    id?: string;
    playoffFormat?: string | null;
    bracketScope?: BracketScopeDto | null;
  } | null;
}): {
  leagueSeasonId?: string;
  scheduleSubtab?: string;
  scheduleGroup?: string;
  scheduleRoundId?: string;
} {
  const leagueSeasonId = game.parentId ?? game.leagueSeason?.id;
  if (!leagueSeasonId || game.leagueRound?.playoffFormat !== 'BRACKET') {
    return {};
  }
  const scope = game.leagueRound?.bracketScope ?? 'PER_GROUP';
  const extras: {
    leagueSeasonId: string;
    scheduleSubtab: string;
    scheduleGroup?: string;
    scheduleRoundId?: string;
  } = {
    leagueSeasonId,
    scheduleSubtab: 'bracket',
  };
  if (scope === 'PER_GROUP' && game.leagueGroupId) {
    extras.scheduleGroup = game.leagueGroupId;
  }
  if (game.leagueRound?.id) {
    extras.scheduleRoundId = game.leagueRound.id;
  }
  return extras;
}

export function leagueRoundStartPushScheduleExtras(game: {
  id: string;
  parentId?: string | null;
  leagueGroupId?: string | null;
  leagueSeason?: { id?: string } | null;
  leagueRound?: {
    id?: string;
    playoffFormat?: string | null;
    bracketScope?: BracketScopeDto | null;
  } | null;
}): {
  leagueSeasonId?: string;
  scheduleSubtab?: string;
  scheduleGroup?: string;
  scheduleRoundId?: string;
} {
  return leagueBracketPushScheduleExtras(game);
}
