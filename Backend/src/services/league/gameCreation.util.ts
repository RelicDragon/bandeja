import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { EntityType, Prisma, WinnerOfGame, WinnerOfMatch, MatchGenerationType } from '@prisma/client';
import { calculateGameStatus } from '../../utils/gameStatus';
import { getUserTimezoneFromCityId } from '../user-timezone.service';
import { GameService } from '../game/game.service';

const PLAYOFF_GAME_TYPE_TEMPLATES: Record<
  'WINNER_COURT' | 'AMERICANO',
  { winnerOfMatch: WinnerOfMatch; winnerOfGame: WinnerOfGame; matchGenerationType: MatchGenerationType; fixedNumberOfSets: number; ballsInGames: boolean }
> = {
  WINNER_COURT: {
    winnerOfMatch: WinnerOfMatch.BY_SCORES,
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    matchGenerationType: MatchGenerationType.WINNERS_COURT,
    fixedNumberOfSets: 1,
    ballsInGames: false,
  },
  AMERICANO: {
    winnerOfMatch: WinnerOfMatch.BY_SCORES,
    winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
    matchGenerationType: MatchGenerationType.RANDOM,
    fixedNumberOfSets: 1,
    ballsInGames: false,
  },
};

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

export interface CreateLeaguePlayoffGameParams {
  leagueRoundId: string;
  leagueSeasonId: string;
  seasonGame: any;
  gameType: 'WINNER_COURT' | 'AMERICANO';
  participantUserIds: string[];
  leagueGroupId?: string;
  /** When set, one GameTeam per entry (team = array of player user IDs). Game has hasFixedTeams: true. */
  teams?: string[][];
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

export async function createLeaguePlayoffGame(
  params: CreateLeaguePlayoffGameParams,
  tx?: Prisma.TransactionClient
) {
  const { leagueRoundId, leagueSeasonId, seasonGame, gameType, participantUserIds, leagueGroupId, teams } = params;
  const db = tx ?? prisma;

  const round = await db.leagueRound.findUnique({
    where: { id: leagueRoundId },
  });

  if (!round) {
    throw new ApiError(404, 'League round not found');
  }

  const template = PLAYOFF_GAME_TYPE_TEMPLATES[gameType as 'WINNER_COURT' | 'AMERICANO'];
  const userIds = Array.from(new Set(participantUserIds));
  const cityTimezone = await getUserTimezoneFromCityId(seasonGame.cityId);
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);
  const participantCount = Math.max(userIds.length, 4);
  const hasFixedTeams = Boolean(teams?.length);

  const game = await db.game.create({
    data: {
      entityType: EntityType.LEAGUE,
      gameType,
      name: `Playoff - ${gameType === 'WINNER_COURT' ? 'Winners Court' : 'Americano'}`,
      clubId: seasonGame.clubId,
      cityId: seasonGame.cityId,
      startTime,
      endTime,
      maxParticipants: participantCount,
      minParticipants: 4,
      minLevel: seasonGame.minLevel,
      maxLevel: seasonGame.maxLevel,
      isPublic: false,
      affectsRating: seasonGame.affectsRating ?? true,
      anyoneCanInvite: false,
      resultsByAnyone: true,
      allowDirectJoin: false,
      hasBookedCourt: false,
      afterGameGoToBar: false,
      hasFixedTeams,
      genderTeams: seasonGame.genderTeams || 'ANY',
      fixedNumberOfSets: template.fixedNumberOfSets,
      maxTotalPointsPerSet: seasonGame.maxTotalPointsPerSet ?? 0,
      maxPointsPerTeam: seasonGame.maxPointsPerTeam ?? 0,
      winnerOfGame: template.winnerOfGame,
      winnerOfMatch: template.winnerOfMatch,
      matchGenerationType: template.matchGenerationType,
      prohibitMatchesEditing: seasonGame.prohibitMatchesEditing ?? false,
      pointsPerWin: seasonGame.pointsPerWin ?? 0,
      pointsPerLoose: seasonGame.pointsPerLoose ?? 0,
      pointsPerTie: seasonGame.pointsPerTie ?? 0,
      ballsInGames: template.ballsInGames,
      parentId: leagueSeasonId,
      leagueRoundId,
      leagueGroupId,
      status: calculateGameStatus(
        {
          startTime,
          endTime,
          resultsStatus: 'NONE',
          timeIsSet: false,
          entityType: EntityType.LEAGUE,
        },
        cityTimezone
      ),
      participants: {
        create: userIds.map((userId) => ({
          userId,
          role: 'PARTICIPANT' as const,
          status: 'PLAYING',
        })),
      },
    },
  });

  if (hasFixedTeams && teams?.length) {
    for (let i = 0; i < teams.length; i++) {
      await db.gameTeam.create({
        data: {
          gameId: game.id,
          teamNumber: i + 1,
          players: {
            create: teams[i].map((userId) => ({ userId })),
          },
        },
      });
    }
  }

  if (!tx) {
    await GameService.updateGameReadiness(game.id);
  }

  return game;
}
