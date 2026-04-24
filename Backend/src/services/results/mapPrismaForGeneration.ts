import type { GenGame, GenMatch, GenRound } from './generation/types';
import type { GameForRoundGeneration } from './roundGenerationGameInclude';

export function prismaGameToGenGame(game: GameForRoundGeneration): GenGame {
  return {
    id: game.id,
    participants: (game.participants || []).map((p) => ({
      userId: p.userId,
      status: p.status,
      user: {
        id: p.user!.id,
        level: Number(p.user?.level) || 0,
        gender: p.user?.gender || 'PREFER_NOT_TO_SAY',
        firstName: p.user?.firstName ?? undefined,
        lastName: p.user?.lastName ?? undefined,
        avatar: p.user?.avatar ?? undefined,
        socialLevel: p.user?.socialLevel ?? undefined,
        approvedLevel: p.user?.approvedLevel,
        isTrainer: p.user?.isTrainer,
      },
    })),
    hasFixedTeams: game.hasFixedTeams,
    fixedTeams: (game.fixedTeams || []).map((ft) => ({
      id: ft.id,
      teamNumber: ft.teamNumber,
      players: (ft.players || []).map((pl) => ({
        userId: pl.userId,
        user: {
          id: pl.user!.id,
          level: Number(pl.user?.level) || 0,
          gender: pl.user?.gender || 'PREFER_NOT_TO_SAY',
        },
      })),
    })),
    gameCourts: [...(game.gameCourts || [])]
      .sort((a, b) => a.order - b.order)
      .map((gc) => ({
        courtId: gc.courtId,
        order: gc.order,
      })),
    matchGenerationType: game.matchGenerationType,
    genderTeams: game.genderTeams,
    ballsInGames: game.ballsInGames,
    fixedNumberOfSets: game.fixedNumberOfSets,
    entityType: game.entityType,
    parentId: game.parentId,
    leagueGroupId: game.leagueGroupId,
    winnerOfGame: game.winnerOfGame,
    winnerOfMatch: game.winnerOfMatch,
    pointsPerWin: game.pointsPerWin,
    pointsPerTie: game.pointsPerTie,
    pointsPerLoose: game.pointsPerLoose,
  };
}

export function prismaRoundsToGenRounds(game: GameForRoundGeneration): GenRound[] {
  const rounds = game.rounds || [];
  return rounds.map((round) => ({
    id: round.id,
    matches: (round.matches || []).map((match): GenMatch => {
      const teamA: string[] = [];
      const teamB: string[] = [];
      for (const team of match.teams || []) {
        const playerIds = (team.players || []).map((pl) => pl.userId).filter(Boolean);
        if (team.teamNumber === 1) teamA.push(...playerIds);
        else if (team.teamNumber === 2) teamB.push(...playerIds);
      }
      const sets = (match.sets || []).map((s) => ({
        teamA: s.teamAScore || 0,
        teamB: s.teamBScore || 0,
        isTieBreak: s.isTieBreak || false,
      }));
      const slicedSets = sets.length > 0 ? sets : [{ teamA: 0, teamB: 0, isTieBreak: false }];
      let winnerId: 'teamA' | 'teamB' | null = null;
      if (match.winnerId) {
        const teamAId = match.teams?.find((t) => t.teamNumber === 1)?.id;
        const teamBId = match.teams?.find((t) => t.teamNumber === 2)?.id;
        if (match.winnerId === teamAId) winnerId = 'teamA';
        else if (match.winnerId === teamBId) winnerId = 'teamB';
      }
      return {
        id: match.id,
        teamA,
        teamB,
        sets: slicedSets,
        winnerId,
        courtId: match.courtId || undefined,
      };
    }),
  }));
}
