import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { EntityType, WinnerOfGame, WinnerOfMatch, MatchGenerationType } from '@prisma/client';
import { calculateGameStatus } from '../../utils/gameStatus';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { GameService } from '../game/game.service';

interface CreateLeagueGameParams {
  leagueRoundId: string;
  seasonGame: any;
  leagueSeasonId: string;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  leagueGroupId?: string;
  maxParticipants?: number;
  minParticipants?: number;
  isPublic?: boolean;
  affectsRating?: boolean;
}

export async function createLeagueGame(params: CreateLeagueGameParams) {
  const {
    leagueRoundId,
    seasonGame,
    leagueSeasonId,
    team1PlayerIds,
    team2PlayerIds,
    leagueGroupId,
    maxParticipants = 4,
    minParticipants = 4,
    isPublic = false,
    affectsRating = true,
  } = params;

  const round = await prisma.leagueRound.findUnique({
    where: { id: leagueRoundId },
  });

  if (!round) {
    throw new ApiError(404, 'League round not found');
  }

  const participantUserIds = Array.from(new Set([...team1PlayerIds, ...team2PlayerIds]));
  const cityTimezone = await getUserTimezoneFromCityId(seasonGame.cityId);
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);

  const game = await prisma.game.create({
    data: {
      entityType: EntityType.LEAGUE,
      gameType: seasonGame.gameType || 'CLASSIC',
      name: `Round ${round.orderIndex + 1} - Game`,
      clubId: seasonGame.clubId,
      cityId: seasonGame.cityId,
      startTime,
      endTime,
      maxParticipants,
      minParticipants,
      minLevel: seasonGame.minLevel,
      maxLevel: seasonGame.maxLevel,
      isPublic,
      affectsRating,
      anyoneCanInvite: false,
      resultsByAnyone: true,
      allowDirectJoin: false,
      hasBookedCourt: false,
      afterGameGoToBar: false,
      hasFixedTeams: true,
      genderTeams: seasonGame.genderTeams || 'ANY',
      fixedNumberOfSets: seasonGame.fixedNumberOfSets ?? 0,
      maxTotalPointsPerSet: seasonGame.maxTotalPointsPerSet ?? 0,
      maxPointsPerTeam: seasonGame.maxPointsPerTeam ?? 0,
      winnerOfGame: seasonGame.winnerOfGame ?? WinnerOfGame.BY_MATCHES_WON,
      winnerOfMatch: seasonGame.winnerOfMatch ?? WinnerOfMatch.BY_SCORES,
      matchGenerationType: seasonGame.matchGenerationType ?? MatchGenerationType.HANDMADE,
      prohibitMatchesEditing: seasonGame.prohibitMatchesEditing ?? false,
      pointsPerWin: seasonGame.pointsPerWin ?? 0,
      pointsPerLoose: seasonGame.pointsPerLoose ?? 0,
      pointsPerTie: seasonGame.pointsPerTie ?? 0,
      ballsInGames: seasonGame.ballsInGames ?? true,
      parentId: leagueSeasonId,
      leagueRoundId: leagueRoundId,
      leagueGroupId,
      status: calculateGameStatus({
        startTime,
        endTime,
        resultsStatus: 'NONE',
        timeIsSet: false,
        entityType: EntityType.LEAGUE,
      }, cityTimezone),
      participants: {
        create: participantUserIds.map(userId => ({
          userId,
          role: 'PARTICIPANT' as const,
          status: 'PLAYING',
        })),
      },
    },
  });

  await prisma.gameTeam.create({
    data: {
      gameId: game.id,
      teamNumber: 1,
      players: {
        create: team1PlayerIds.map(userId => ({ userId })),
      },
    },
  });

  await prisma.gameTeam.create({
    data: {
      gameId: game.id,
      teamNumber: 2,
      players: {
        create: team2PlayerIds.map(userId => ({ userId })),
      },
    },
  });

  await GameService.updateGameReadiness(game.id);

  return game;
}

