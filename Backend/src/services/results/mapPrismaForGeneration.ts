import { Sport } from '@prisma/client';
import type { GenGame, GenMatch, GenRound } from './generation/types';
import type { GameForRoundGeneration } from '../game/gamePrismaIncludes';
import { projectUserForSportContext } from '../user/userSportProfile.service';

export function prismaGameToGenGame(game: GameForRoundGeneration): GenGame {
  const sport = game.sport ?? Sport.PADEL;
  const mapUser = (u: NonNullable<GameForRoundGeneration['participants'][0]['user']>) => {
    const projected = projectUserForSportContext(u, sport);
    return {
      id: projected.id,
      level: Number(projected.level) || 0,
      gender: projected.gender || 'PREFER_NOT_TO_SAY',
      firstName: projected.firstName ?? undefined,
      lastName: projected.lastName ?? undefined,
      avatar: projected.avatar ?? undefined,
      socialLevel: projected.socialLevel ?? undefined,
      approvedLevel: projected.approvedLevel,
      isTrainer: projected.isTrainer,
    };
  };

  return {
    id: game.id,
    sport,
    maxParticipants: game.maxParticipants,
    playersPerMatch: game.playersPerMatch,
    participants: (game.participants || []).map((p) => ({
      userId: p.userId,
      status: p.status,
      user: mapUser(p.user!),
    })),
    hasFixedTeams: game.hasFixedTeams,
    allowUserInMultipleTeams: game.allowUserInMultipleTeams ?? false,
    fixedTeams: (game.fixedTeams || []).map((ft) => ({
      id: ft.id,
      teamNumber: ft.teamNumber,
      players: (ft.players || []).map((pl) => ({
        userId: pl.userId,
        user: mapUser(pl.user!),
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
    scoringPreset: game.scoringPreset,
    matchTimerEnabled: game.matchTimerEnabled,
    maxTotalPointsPerSet: game.maxTotalPointsPerSet,
    maxPointsPerTeam: game.maxPointsPerTeam,
    hasGoldenPoint: game.hasGoldenPoint,
  };
}

export function prismaRoundsToGenRounds(game: GameForRoundGeneration): GenRound[] {
  const rounds = game.rounds || [];
  return rounds.map((round) => ({
    id: round.id,
    matches: (round.matches || []).map((match): GenMatch => {
      const teamA: string[] = [];
      const teamB: string[] = [];
      let fixedTeamIdA: string | undefined;
      let fixedTeamIdB: string | undefined;
      for (const team of match.teams || []) {
        const playerIds = (team.players || []).map((pl) => pl.userId).filter(Boolean);
        const meta = team.metadata as { gameTeamId?: string } | null | undefined;
        if (team.teamNumber === 1) {
          teamA.push(...playerIds);
          fixedTeamIdA = meta?.gameTeamId;
        } else if (team.teamNumber === 2) {
          teamB.push(...playerIds);
          fixedTeamIdB = meta?.gameTeamId;
        }
      }
      const sets = (match.sets || []).map((s) => ({
        teamA: s.teamAScore || 0,
        teamB: s.teamBScore || 0,
        isTieBreak: s.isTieBreak || false,
        role: s.role,
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
        ...(fixedTeamIdA ? { fixedTeamIdA } : {}),
        ...(fixedTeamIdB ? { fixedTeamIdB } : {}),
      };
    }),
  }));
}
