import type { GameSetupFormInitialValues } from '@/components/GameSetup/GameSetupForm';

export const PLAYOFF_GAME_TYPE_TEMPLATES: Record<'WINNER_COURT' | 'AMERICANO', GameSetupFormInitialValues> = {
  WINNER_COURT: {
    winnerOfMatch: 'BY_SCORES',
    winnerOfGame: 'BY_MATCHES_WON',
    matchGenerationType: 'WINNERS_COURT',
    fixedNumberOfSets: 1,
    maxTotalPointsPerSet: 0,
    maxPointsPerTeam: 0,
    prohibitMatchesEditing: false,
    pointsPerWin: 0,
    pointsPerLoose: 0,
    pointsPerTie: 0,
  },
  AMERICANO: {
    winnerOfMatch: 'BY_SCORES',
    winnerOfGame: 'BY_SCORES_DELTA',
    matchGenerationType: 'RANDOM',
    fixedNumberOfSets: 1,
    maxTotalPointsPerSet: 0,
    maxPointsPerTeam: 0,
    prohibitMatchesEditing: false,
    pointsPerWin: 0,
    pointsPerLoose: 0,
    pointsPerTie: 0,
  },
};
