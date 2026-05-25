import type { Game } from '@/types';
import {
  buildLeagueBracketSchedulePath,
  type LeagueBracketScheduleDeepLinkParams,
} from '@/utils/leagueBracketScheduleDeepLink.util';

export type GameBracketReturnTarget = {
  leagueSeasonId: string;
  roundId: string;
  groupId: string | null;
};

export function resolveGameBracketReturnTarget(game: Game): GameBracketReturnTarget | null {
  if (game.entityType !== 'LEAGUE') return null;

  const leagueSeasonId = game.parent?.leagueSeason?.id ?? game.parentId ?? null;
  const roundId = game.leagueRoundId ?? game.leagueRound?.id ?? null;
  if (!leagueSeasonId || !roundId) return null;

  return {
    leagueSeasonId,
    roundId,
    groupId: game.leagueGroupId ?? game.leagueGroup?.id ?? null,
  };
}

export function buildGameBracketReturnPath(
  target: GameBracketReturnTarget,
  bracketScope: LeagueBracketScheduleDeepLinkParams['bracketScope'] = 'PER_GROUP'
): string {
  return buildLeagueBracketSchedulePath(target.leagueSeasonId, {
    roundId: target.roundId,
    groupId: target.groupId,
    bracketScope,
  });
}
