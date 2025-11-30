import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { EntityType, WinnerOfGame, WinnerOfMatch, ParticipantLevelUpMode, MatchGenerationType } from '@prisma/client';
import { calculateGameStatus } from '../../../utils/gameStatus';
import { GameService } from '../../game/game.service';

interface TempTeam {
  participant1Id: string;
  participant2Id: string;
  participant1: any;
  participant2: any;
}

export class TeamForRoundGeneration {
  static async generateGamesForRound(leagueRoundId: string) {
    const round = await prisma.leagueRound.findUnique({
      where: { id: leagueRoundId },
      include: {
        leagueSeason: {
          include: {
            game: true,
          },
        },
      },
    });

    if (!round) {
      throw new ApiError(404, 'League round not found');
    }

    if (!round.leagueSeason || !round.leagueSeason.game) {
      throw new ApiError(404, 'League season or game not found');
    }

    const seasonGame = round.leagueSeason.game;
    const leagueSeasonId = round.leagueSeasonId;

    const groups = await prisma.leagueGroup.findMany({
      where: { leagueSeasonId },
    });

    if (groups.length === 0) {
      throw new ApiError(400, 'No groups found for this league season');
    }

    for (const group of groups) {
      await this.generateGamesForGroup(
        group.id,
        leagueSeasonId,
        leagueRoundId,
        seasonGame
      );
    }

    return await prisma.leagueRound.findUnique({
      where: { id: leagueRoundId },
      include: {
        games: {
          include: {
            participants: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    level: true,
                    gender: true,
                  },
                },
              },
            },
            fixedTeams: {
              include: {
                players: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        avatar: true,
                        level: true,
                        gender: true,
                      },
                    },
                  },
                },
              },
              orderBy: { teamNumber: 'asc' },
            },
          },
        },
      },
    });
  }

  private static async generateGamesForGroup(
    groupId: string,
    leagueSeasonId: string,
    leagueRoundId: string,
    seasonGame: any
  ) {
    let participants = await prisma.leagueParticipant.findMany({
      where: {
        leagueSeasonId,
        currentGroupId: groupId,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            level: true,
            gender: true,
          },
        },
      },
    });

    if (participants.length < 4) {
      return;
    }

    participants.sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      const aLevel = a.user?.level || 0;
      const bLevel = b.user?.level || 0;
      return bLevel - aLevel;
    });

    if (participants.length % 2 !== 0) {
      participants = participants.slice(0, -1);
    }

    if (participants.length < 4) {
      return;
    }

    const teams = this.createTeams(participants);

    await this.createRoundRobinGames(
      teams,
      leagueRoundId,
      seasonGame,
      groupId,
      leagueSeasonId
    );
  }

  private static createTeams(participants: any[]): TempTeam[] {
    const teams: TempTeam[] = [];
    const n = participants.length;

    for (let i = 0; i < n / 2; i++) {
      teams.push({
        participant1Id: participants[i].userId!,
        participant2Id: participants[n - 1 - i].userId!,
        participant1: participants[i],
        participant2: participants[n - 1 - i],
      });
    }

    return teams;
  }

  private static async createRoundRobinGames(
    teams: TempTeam[],
    leagueRoundId: string,
    seasonGame: any,
    groupId: string,
    leagueSeasonId: string
  ) {
    const n = teams.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        await this.createGame(
          teams[i],
          teams[j],
          leagueRoundId,
          seasonGame,
          groupId,
          leagueSeasonId
        );
      }
    }
  }

  private static async createGame(
    team1: TempTeam,
    team2: TempTeam,
    leagueRoundId: string,
    seasonGame: any,
    groupId: string,
    leagueSeasonId: string
  ) {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const round = await prisma.leagueRound.findUnique({
      where: { id: leagueRoundId },
    });

    if (!round) {
      throw new ApiError(404, 'League round not found');
    }

    const participantUserIds = Array.from(
      new Set([
        team1.participant1Id,
        team1.participant2Id,
        team2.participant1Id,
        team2.participant2Id,
      ])
    );

    const game = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE,
        gameType: seasonGame.gameType || 'CLASSIC',
        name: `Round ${round.orderIndex + 1} - Game`,
        clubId: seasonGame.clubId,
        cityId: seasonGame.cityId,
        startTime,
        endTime,
        maxParticipants: 4,
        minParticipants: 4,
        minLevel: seasonGame.minLevel,
        maxLevel: seasonGame.maxLevel,
        isPublic: false,
        affectsRating: true,
        anyoneCanInvite: false,
        resultsByAnyone: false,
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
        participantLevelUpMode: seasonGame.participantLevelUpMode ?? ParticipantLevelUpMode.BY_MATCHES,
        matchGenerationType: seasonGame.matchGenerationType ?? MatchGenerationType.HANDMADE,
        prohibitMatchesEditing: seasonGame.prohibitMatchesEditing ?? false,
        pointsPerWin: seasonGame.pointsPerWin ?? 0,
        pointsPerLoose: seasonGame.pointsPerLoose ?? 0,
        pointsPerTie: seasonGame.pointsPerTie ?? 0,
        parentId: leagueSeasonId,
        leagueRoundId: leagueRoundId,
        leagueGroupId: groupId,
        status: calculateGameStatus({
          startTime,
          endTime,
          resultsStatus: 'NONE',
        }),
        participants: {
          create: participantUserIds.map(userId => ({
            userId,
            role: 'PARTICIPANT' as const,
            isPlaying: true,
          })),
        },
      },
    });

    await prisma.gameTeam.create({
      data: {
        gameId: game.id,
        teamNumber: 1,
        players: {
          create: [
            { userId: team1.participant1Id },
            { userId: team1.participant2Id },
          ],
        },
      },
    });

    await prisma.gameTeam.create({
      data: {
        gameId: game.id,
        teamNumber: 2,
        players: {
          create: [
            { userId: team2.participant1Id },
            { userId: team2.participant2Id },
          ],
        },
      },
    });

    await GameService.updateGameReadiness(game.id);

    return game;
  }
}

