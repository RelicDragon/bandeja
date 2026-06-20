import type { Game } from '@/types';

/** Fields copied when duplicating a game or “play again” from results. */
export function buildDuplicateGameInitialData(game: Game): Partial<Game> {
  const data: Partial<Game> = {
    entityType: game.entityType,
    gameType: game.gameType,
    name: game.name,
    description: game.description,
    clubId: game.clubId,
    courtId: game.courtId,
    startTime: game.startTime,
    endTime: game.endTime,
    sport: game.sport,
    scoringPreset: game.scoringPreset,
    scoringMode: game.scoringMode,
    maxParticipants: game.maxParticipants,
    playersPerMatch: game.playersPerMatch,
    minParticipants: game.minParticipants,
    minLevel: game.minLevel,
    maxLevel: game.maxLevel,
    isPublic: game.isPublic,
    affectsRating: game.affectsRating,
    anyoneCanInvite: game.anyoneCanInvite,
    resultsByAnyone: game.resultsByAnyone,
    allowDirectJoin: game.allowDirectJoin,
    hasBookedCourt: game.hasBookedCourt,
    afterGameGoToBar: game.afterGameGoToBar,
    hasFixedTeams: game.hasFixedTeams,
    genderTeams: game.genderTeams,
    priceTotal: game.priceTotal,
    priceType: game.priceType,
    priceCurrency: game.priceCurrency,
    fixedNumberOfSets: game.fixedNumberOfSets,
    maxTotalPointsPerSet: game.maxTotalPointsPerSet,
    maxPointsPerTeam: game.maxPointsPerTeam,
    winnerOfGame: game.winnerOfGame,
    winnerOfMatch: game.winnerOfMatch,
    matchGenerationType: game.matchGenerationType,
    pointsPerWin: game.pointsPerWin,
    pointsPerLoose: game.pointsPerLoose,
    pointsPerTie: game.pointsPerTie,
    ballsInGames: game.ballsInGames,
    deucesBeforeGoldenPoint: game.deucesBeforeGoldenPoint,
    matchTimerEnabled: game.matchTimerEnabled,
    matchTimedCapMinutes: game.matchTimedCapMinutes,
    gameCourts: game.gameCourts,
  };

  if (game.entityType === 'LEAGUE_SEASON') {
    if (game.parentId) {
      data.parentId = game.parentId;
    } else if (game.leagueSeason?.league?.id) {
      data.parentId = game.leagueSeason.league.id;
    }
  }

  return data;
}
