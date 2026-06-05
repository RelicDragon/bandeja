import { WinnerOfGame } from '@prisma/client';
import {
  buildAggregatesFromRoundResults,
  buildHeadToHeadFromRoundResults,
  type RoundResultForAggregates,
} from './playerAggregates';
import {
  applyPlacementToOutcomes,
  computePlacementFromAggregates,
  type PlacementContext,
} from './outcomePlacement';
import type { GameOutcomeResult } from './calculator.service';

export type OutcomePlacementInput = Partial<
  Pick<
    PlacementContext,
    'hasFixedTeams' | 'genderTeams' | 'fixedTeams' | 'userGenderById'
  >
>;

export function applySharedPlacementToOutcomes(
  players: Array<{ userId: string; level: number }>,
  roundResults: RoundResultForAggregates[],
  winnerOfGame: WinnerOfGame,
  pointsPerWin: number,
  pointsPerTie: number,
  pointsPerLoose: number,
  ratingOutcomes: GameOutcomeResult[],
  placementInput: OutcomePlacementInput = {},
): GameOutcomeResult[] {
  const aggregates = buildAggregatesFromRoundResults(players, roundResults);
  const h2hMap = buildHeadToHeadFromRoundResults(
    players.map((p) => p.userId),
    roundResults,
  );
  const placement = computePlacementFromAggregates(aggregates, h2hMap, {
    winnerOfGame,
    pointsPerWin,
    pointsPerTie,
    pointsPerLoose,
    hasFixedTeams: placementInput.hasFixedTeams ?? false,
    genderTeams: placementInput.genderTeams ?? null,
    fixedTeams: placementInput.fixedTeams,
    userGenderById: placementInput.userGenderById,
  });
  return applyPlacementToOutcomes(ratingOutcomes, placement);
}
