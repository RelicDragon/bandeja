import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { EntityType, WinnerOfGame, WinnerOfMatch, ParticipantLevelUpMode, MatchGenerationType } from '@prisma/client';

export class LeagueCreateService {
  static async createLeague(data: any, userId: string) {
    if (!data.name || !data.name.trim()) {
      throw new ApiError(400, 'League name is required');
    }

    if (!data.cityId) {
      throw new ApiError(400, 'City is required');
    }

    if (!data.season) {
      throw new ApiError(400, 'Season data is required');
    }

    if (!data.season.startDate) {
      throw new ApiError(400, 'Season start date is required');
    }

    const startDate = new Date(data.season.startDate);
    if (isNaN(startDate.getTime())) {
      throw new ApiError(400, 'Invalid start date');
    }

    const minLevel = data.season.minLevel ?? 1.0;
    const maxLevel = data.season.maxLevel ?? 7.0;
    const maxParticipants = data.season.maxParticipants ?? 4;

    if (minLevel < 1.0 || minLevel > 7.0 || maxLevel < 1.0 || maxLevel > 7.0) {
      throw new ApiError(400, 'Level must be between 1.0 and 7.0');
    }

    if (minLevel > maxLevel) {
      throw new ApiError(400, 'Min level cannot be greater than max level');
    }

    if (maxParticipants < 4 || maxParticipants > 999) {
      throw new ApiError(400, 'Max participants must be between 4 and 999');
    }

    const gameSeasonData = data.season.gameSeason || {};
    const seasonName = data.season.name?.trim() || '';

    const gameSeasonGame = await prisma.game.create({
      data: {
        entityType: 'LEAGUE_SEASON' as EntityType,
        gameType: 'CLASSIC',
        name: seasonName,
        avatar: data.season?.avatar,
        originalAvatar: data.season?.originalAvatar,
        fixedNumberOfSets: gameSeasonData.fixedNumberOfSets ?? 0,
        maxTotalPointsPerSet: gameSeasonData.maxTotalPointsPerSet ?? 0,
        maxPointsPerTeam: gameSeasonData.maxPointsPerTeam ?? 0,
        winnerOfGame: (gameSeasonData.winnerOfGame as WinnerOfGame) ?? WinnerOfGame.BY_MATCHES_WON,
        winnerOfMatch: (gameSeasonData.winnerOfMatch as WinnerOfMatch) ?? WinnerOfMatch.BY_SCORES,
        participantLevelUpMode: (gameSeasonData.participantLevelUpMode as ParticipantLevelUpMode) ?? ParticipantLevelUpMode.BY_MATCHES,
        matchGenerationType: (gameSeasonData.matchGenerationType as MatchGenerationType) ?? MatchGenerationType.HANDMADE,
        prohibitMatchesEditing: gameSeasonData.prohibitMatchesEditing ?? false,
        pointsPerWin: gameSeasonData.pointsPerWin ?? 0,
        pointsPerLoose: gameSeasonData.pointsPerLoose ?? 0,
        pointsPerTie: gameSeasonData.pointsPerTie ?? 0,
        hasFixedTeams: data.hasFixedTeams ?? false,
        cityId: data.cityId,
        clubId: data.clubId || null,
        startTime: startDate,
        endTime: startDate,
        maxParticipants,
        minParticipants: 0,
        minLevel,
        maxLevel,
        status: 'ANNOUNCED',
        participants: {
          create: {
            userId: userId,
            role: 'OWNER',
            isPlaying: false,
          },
        },
      },
    });

    const league = await prisma.league.create({
      data: {
        name: data.name.trim(),
        description: data.description?.trim() || null,
        hasFixedTeams: data.hasFixedTeams ?? false,
        cityId: data.cityId,
        clubId: data.clubId || null,
        seasons: {
          create: {
            id: gameSeasonGame.id,
            orderIndex: 0,
          },
        },
      },
      include: {
        seasons: {
          include: {
            game: true,
          },
        },
        city: true,
        club: true,
      },
    });

    return league;
  }

  static async createLeagueRound(leagueSeasonId: string, userId: string) {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: {
          include: {
            participants: {
              where: {
                userId: userId,
                role: { in: ['OWNER', 'ADMIN'] },
              },
            },
          },
        },
      },
    });

    if (!leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    if (!leagueSeason.game) {
      throw new ApiError(404, 'League season game not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can create league rounds');
    }

    const existingRounds = await prisma.leagueRound.findMany({
      where: { leagueSeasonId },
      orderBy: { orderIndex: 'desc' },
      take: 1,
    });

    const nextOrderIndex = existingRounds.length > 0 ? existingRounds[0].orderIndex + 1 : 0;

    const round = await prisma.leagueRound.create({
      data: {
        leagueSeasonId,
        orderIndex: nextOrderIndex,
      },
      include: {
        games: true,
      },
    });

    return round;
  }
}
