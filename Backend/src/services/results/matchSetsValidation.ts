import { MatchSetRole, ScoringPreset, WinnerOfMatch } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { validateMatchClassicSetScores } from './classicSetScoreValidation';
import { isOfficialMatchSetRole, validateMatchSetRoleOrder } from './matchSetRole';

export type GameForMatchSetValidation = {
  scoringPreset: ScoringPreset | null;
  fixedNumberOfSets: number;
  ballsInGames: boolean;
  winnerOfMatch: WinnerOfMatch;
  matchTimerEnabled?: boolean;
};

export type NormalizedMatchSetRow = {
  teamA: number;
  teamB: number;
  isTieBreak: boolean;
  role: MatchSetRole;
};

export type AssertMatchNormalizedSetsValidOptions = {
  /** Live scoring persists in-progress game/point totals; skip finished-set classic checks. */
  skipClassicGameScoreValidation?: boolean;
};

export function assertMatchNormalizedSetsValid(
  game: GameForMatchSetValidation,
  normalizedSets: NormalizedMatchSetRow[],
  options?: AssertMatchNormalizedSetsValidOptions
): void {
  const orderErr = validateMatchSetRoleOrder(normalizedSets.map((s) => s.role));
  if (orderErr) {
    throw new ApiError(400, orderErr);
  }

  for (const s of normalizedSets) {
    if (!isOfficialMatchSetRole(s.role) && s.isTieBreak) {
      throw new ApiError(400, 'Extra sets cannot be tie-breaks');
    }
  }

  const officialForClassic = normalizedSets
    .filter((s) => isOfficialMatchSetRole(s.role))
    .map((s) => ({ teamA: s.teamA, teamB: s.teamB, isTieBreak: s.isTieBreak }));

  const setsWithTieBreak = normalizedSets.filter((set) => set.isTieBreak);

  if (setsWithTieBreak.length > 1) {
    throw new ApiError(400, 'Only one TieBreak can exist per match');
  }

  if (setsWithTieBreak.length === 1) {
    const tieBreakSetIndex = normalizedSets.findIndex((set) => set.isTieBreak);

    if (!isOfficialMatchSetRole(normalizedSets[tieBreakSetIndex].role)) {
      throw new ApiError(400, 'TieBreak can only be set on official sets');
    }

    if (!game.ballsInGames) {
      throw new ApiError(400, 'TieBreak can only be set when ballsInGames is enabled');
    }

    const isOddSetFromThird = tieBreakSetIndex >= 2 && (tieBreakSetIndex - 2) % 2 === 0;
    if (!isOddSetFromThird) {
      throw new ApiError(400, 'TieBreak can only be set on the 3rd, 5th, 7th, or 9th set');
    }

    if (tieBreakSetIndex >= 2) {
      let teamAWins = 0;
      let teamBWins = 0;

      for (let i = 0; i < tieBreakSetIndex; i++) {
        const set = normalizedSets[i];
        if (!isOfficialMatchSetRole(set.role)) continue;
        if (set.teamA > 0 || set.teamB > 0) {
          if (set.teamA > set.teamB) {
            teamAWins++;
          } else if (set.teamB > set.teamA) {
            teamBWins++;
          }
        }
      }

      if (teamAWins !== teamBWins) {
        throw new ApiError(400, 'TieBreak can only be set when previous sets are equally won by both teams');
      }
    }

    const tieBreakSet = normalizedSets[tieBreakSetIndex];
    if (tieBreakSet && tieBreakSet.teamA === tieBreakSet.teamB && (tieBreakSet.teamA > 0 || tieBreakSet.teamB > 0)) {
      throw new ApiError(400, 'TieBreak sets cannot have equal scores');
    }

    const fixedNumberOfSets = game.fixedNumberOfSets || 0;

    let isLastSet: boolean;
    if (fixedNumberOfSets > 0) {
      isLastSet = tieBreakSetIndex === fixedNumberOfSets - 1;
    } else {
      const validSetIndices: number[] = [];
      for (let i = 0; i < normalizedSets.length; i++) {
        const set = normalizedSets[i];
        if (!isOfficialMatchSetRole(set.role)) continue;
        if (set.teamA > 0 || set.teamB > 0) {
          validSetIndices.push(i);
        }
      }

      if (validSetIndices.length === 0) {
        isLastSet = tieBreakSetIndex === 0;
      } else {
        const lastValidSetIndex = Math.max(...validSetIndices);
        isLastSet = tieBreakSetIndex === lastValidSetIndex;
      }
    }

    if (!isLastSet) {
      throw new ApiError(400, 'TieBreak can only be set on the last set of a match');
    }
  }

  if (!options?.skipClassicGameScoreValidation) {
    const classicErr = validateMatchClassicSetScores(game, officialForClassic);
    if (classicErr) {
      throw new ApiError(400, classicErr);
    }
  }
}
