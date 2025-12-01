import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { EntityType, WinnerOfGame, WinnerOfMatch, ParticipantLevelUpMode, MatchGenerationType } from '@prisma/client';
import { calculateGameStatus } from '../../utils/gameStatus';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { GameTeamService } from '../gameTeam.service';
import { GameService } from '../game/game.service';
import { getDistinctLeagueGroupColor } from './groupColors';

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
        ballsInGames: gameSeasonData.ballsInGames ?? false,
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

  static async createLeagueRound(leagueSeasonId: string, userId: string, creationType?: string) {
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

    if (creationType) {
      await this.handleRoundCreationType(creationType, round.id);
    }

    return round;
  }

  static async handleRoundCreationType(creationType: string, leagueRoundId: string) {
    switch (creationType) {
      case 'TEAM_FOR_ROUND':
        const { TeamForRoundGeneration } = await import('./generation/TeamForRoundGeneration');
        await TeamForRoundGeneration.generateGamesForRound(leagueRoundId);
        break;
      default:
        break;
    }
  }

  static async createGameForRound(leagueRoundId: string, userId: string, leagueGroupId?: string) {
    const round = await prisma.leagueRound.findUnique({
      where: { id: leagueRoundId },
      include: {
        leagueSeason: {
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
        },
      },
    });

    if (!round) {
      throw new ApiError(404, 'League round not found');
    }

    if (!round.leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    if (!round.leagueSeason.game) {
      throw new ApiError(404, 'League season game not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (round.leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can create games for rounds');
    }

    if (leagueGroupId) {
      const leagueGroup = await prisma.leagueGroup.findUnique({
        where: { id: leagueGroupId },
        select: { id: true, leagueSeasonId: true },
      });

      if (!leagueGroup || leagueGroup.leagueSeasonId !== round.leagueSeasonId) {
        throw new ApiError(400, 'Invalid league group for this round');
      }
    }

    const seasonGame = await prisma.game.findUnique({
      where: { id: round.leagueSeason.game.id },
      include: {
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    const hasFixedTeams = seasonGame.hasFixedTeams || false;
    const leagueId = round.leagueSeason.leagueId;

    const standings = await prisma.leagueParticipant.findMany({
      where: {
        leagueSeasonId: round.leagueSeasonId,
        ...(leagueGroupId ? { currentGroupId: leagueGroupId } : {}),
      },
      include: {
        user: {
          select: USER_SELECT_FIELDS,
        },
        leagueTeam: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
          },
        },
      },
    });

    if (hasFixedTeams) {
      const allGameTeamPlayerIds = new Set<string>();
      seasonGame.fixedTeams.forEach(team => {
        team.players.forEach(player => {
          allGameTeamPlayerIds.add(player.userId);
        });
      });

      const standingsPlayerIds = new Set<string>();
      standings.forEach(standing => {
        if (standing.leagueTeam) {
          standing.leagueTeam.players.forEach(p => standingsPlayerIds.add(p.userId));
        }
      });

      for (const fixedTeam of seasonGame.fixedTeams) {
        const teamPlayerIds = fixedTeam.players.map(p => p.userId).sort();
        let matchingLeagueTeam = null;

        for (const standing of standings) {
          if (standing.leagueTeam) {
            const standingPlayerIds = standing.leagueTeam.players.map(p => p.userId).sort();
            if (teamPlayerIds.length === standingPlayerIds.length &&
                teamPlayerIds.every((id, idx) => id === standingPlayerIds[idx])) {
              matchingLeagueTeam = standing.leagueTeam;
              break;
            }
          }
        }

        if (!matchingLeagueTeam) {
          const newLeagueTeam = await prisma.leagueTeam.create({
            data: {
              players: {
                create: teamPlayerIds.map(userId => ({
                  userId,
                })),
              },
            },
          });

          await prisma.leagueParticipant.create({
            data: {
              leagueId,
              leagueSeasonId: round.leagueSeasonId,
              participantType: 'TEAM',
              leagueTeamId: newLeagueTeam.id,
              points: 0,
              wins: 0,
              ties: 0,
              losses: 0,
              scoreDelta: 0,
            },
          });
        }
      }

      for (const playerId of allGameTeamPlayerIds) {
        if (!standingsPlayerIds.has(playerId)) {
          const existingStanding = standings.find(s => s.userId === playerId);
          if (!existingStanding) {
            await prisma.leagueParticipant.create({
              data: {
                leagueId,
                leagueSeasonId: round.leagueSeasonId,
                participantType: 'USER',
                userId: playerId,
                points: 0,
                wins: 0,
                ties: 0,
                losses: 0,
                scoreDelta: 0,
              },
            });
          }
        }
      }
    } else {
      const standingsUserIds = new Set(
        standings
          .filter(s => s.userId)
          .map(s => s.userId!)
      );

      for (const participant of seasonGame.participants) {
        if (!standingsUserIds.has(participant.userId)) {
          await prisma.leagueParticipant.create({
            data: {
              leagueId,
              leagueSeasonId: round.leagueSeasonId,
              participantType: 'USER',
              userId: participant.userId,
              points: 0,
              wins: 0,
              ties: 0,
              losses: 0,
              scoreDelta: 0,
            },
          });
        }
      }
    }

    const updatedStandings = await prisma.leagueParticipant.findMany({
      where: {
        leagueSeasonId: round.leagueSeasonId,
        ...(leagueGroupId ? { currentGroupId: leagueGroupId } : {}),
      },
      include: {
        user: {
          select: USER_SELECT_FIELDS,
        },
        leagueTeam: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
          },
        },
      },
      orderBy: [
        { points: 'desc' },
        { wins: 'desc' },
        { scoreDelta: 'desc' },
      ],
    });

    if (updatedStandings.length < 2) {
      throw new ApiError(400, 'Not enough participants in standings to create a game');
    }

    const allPlayerIds = new Set<string>();
    updatedStandings.forEach(standing => {
      if (hasFixedTeams && standing.leagueTeam) {
        standing.leagueTeam.players.forEach(p => allPlayerIds.add(p.userId));
      } else if (!hasFixedTeams && standing.userId) {
        allPlayerIds.add(standing.userId);
      }
    });

    if (allPlayerIds.size < 4) {
      throw new ApiError(400, 'At least 4 participants are required to create a game');
    }

    let team1Standing = updatedStandings[0];
    let team2Standing = updatedStandings[1];
    
    if (!hasFixedTeams) {
      let team2Index = 1;
      while (team2Index < updatedStandings.length && 
             team2Standing.userId === team1Standing.userId) {
        team2Index++;
        if (team2Index < updatedStandings.length) {
          team2Standing = updatedStandings[team2Index];
        }
      }
      
      if (team2Standing.userId === team1Standing.userId) {
        throw new ApiError(400, 'Not enough different participants in standings to create a game');
      }
    } else {
      let team2Index = 1;
      while (team2Index < updatedStandings.length && 
             team2Standing.leagueTeamId === team1Standing.leagueTeamId) {
        team2Index++;
        if (team2Index < updatedStandings.length) {
          team2Standing = updatedStandings[team2Index];
        }
      }
      
      if (team2Standing.leagueTeamId === team1Standing.leagueTeamId) {
        throw new ApiError(400, 'Not enough different teams in standings to create a game');
      }
    }

    let team1PlayerIds: string[] = [];
    let team2PlayerIds: string[] = [];

    if (hasFixedTeams) {
      if (team1Standing.leagueTeam) {
        team1PlayerIds = team1Standing.leagueTeam.players.map(p => p.userId);
      }
      if (team2Standing.leagueTeam) {
        team2PlayerIds = team2Standing.leagueTeam.players.map(p => p.userId);
      }
    } else {
      if (team1Standing.userId) {
        team1PlayerIds = [team1Standing.userId];
      }
      if (team2Standing.userId) {
        team2PlayerIds = [team2Standing.userId];
      }
    }

    if (team1PlayerIds.length === 0 || team2PlayerIds.length === 0) {
      throw new ApiError(400, 'Invalid team composition');
    }

    const team1Set = new Set(team1PlayerIds);
    const team2Set = new Set(team2PlayerIds);
    const hasOverlap = team1PlayerIds.some(id => team2Set.has(id)) || team2PlayerIds.some(id => team1Set.has(id));
    
    if (hasOverlap) {
      throw new ApiError(400, 'Team 1 and Team 2 must have different participants');
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

    const participantUserIds = Array.from(new Set([...team1PlayerIds, ...team2PlayerIds]));

    const game = await prisma.game.create({
      data: {
        entityType: EntityType.LEAGUE,
        gameType: seasonGame.gameType || 'CLASSIC',
        name: `Round ${round.orderIndex + 1} - Game`,
        clubId: seasonGame.clubId,
        cityId: seasonGame.cityId,
        startTime,
        endTime,
        maxParticipants: seasonGame.maxParticipants,
        minParticipants: seasonGame.minParticipants || 2,
        minLevel: seasonGame.minLevel,
        maxLevel: seasonGame.maxLevel,
        isPublic: seasonGame.isPublic,
        affectsRating: seasonGame.affectsRating,
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
        parentId: round.leagueSeasonId,
        leagueRoundId: leagueRoundId,
        leagueGroupId,
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
      include: {
        club: {
          include: {
            courts: true,
            city: {
              select: {
                name: true,
              },
            },
          },
        },
        court: {
          include: {
            club: true,
          },
        },
        participants: {
          include: {
            user: {
              select: USER_SELECT_FIELDS,
            },
          },
        },
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
          },
          orderBy: { teamNumber: 'asc' },
        },
        leagueSeason: {
          include: {
            league: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (team1PlayerIds.length > 0 || team2PlayerIds.length > 0) {
      const teamsData = [];
      if (team1PlayerIds.length > 0) {
        teamsData.push({
          teamNumber: 1,
          playerIds: team1PlayerIds,
        });
      }
      if (team2PlayerIds.length > 0) {
        teamsData.push({
          teamNumber: 2,
          playerIds: team2PlayerIds,
        });
      }
      
      if (teamsData.length > 0) {
        await GameTeamService.setGameTeams(game.id, teamsData, userId);
        
        const updatedGame = await prisma.game.findUnique({
          where: { id: game.id },
          include: {
            club: {
              include: {
                courts: true,
                city: {
                  select: {
                    name: true,
                  },
                },
              },
            },
            court: {
              include: {
                club: true,
              },
            },
            participants: {
              include: {
                user: {
                  select: USER_SELECT_FIELDS,
                },
              },
            },
            fixedTeams: {
              include: {
                players: {
                  include: {
                    user: {
                      select: USER_SELECT_FIELDS,
                    },
                  },
                },
              },
              orderBy: { teamNumber: 'asc' },
            },
            leagueSeason: {
              include: {
                league: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        });
        
        return updatedGame || game;
      }
    }

    await GameService.updateGameReadiness(game.id);

    return game;
  }

  static async createLeagueGroups(leagueSeasonId: string, numberOfGroups: number, userId: string) {
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
        groups: true,
        rounds: true,
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
      throw new ApiError(403, 'Only owners and admins can create league groups');
    }

    if (leagueSeason.rounds.length > 0) {
      throw new ApiError(400, 'Cannot create groups when rounds already exist');
    }

    if (leagueSeason.groups.length > 0) {
      throw new ApiError(400, 'Groups already exist for this league season');
    }

    const participants = await prisma.leagueParticipant.findMany({
      where: { leagueSeasonId },
      include: {
        user: {
          select: {
            ...USER_SELECT_FIELDS,
            level: true,
          },
        },
        leagueTeam: {
          include: {
            players: {
              include: {
                user: {
                  select: {
                    ...USER_SELECT_FIELDS,
                    level: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (participants.length < 4) {
      throw new ApiError(400, 'At least 4 participants are required to create groups');
    }

    const minGroups = 1;
    const maxGroups = Math.floor(participants.length / 4);

    if (numberOfGroups < minGroups || numberOfGroups > maxGroups) {
      throw new ApiError(400, `Number of groups must be between ${minGroups} and ${maxGroups}`);
    }

    const sortedParticipants = participants.sort((a, b) => {
      const aLevel = a.user?.level || 0;
      const bLevel = b.user?.level || 0;
      return bLevel - aLevel;
    });

    const groups: { name: string; participantIds: string[]; color: string }[] = [];
    const groupNames = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const usedGroupColors: string[] = [];

    for (let i = 0; i < numberOfGroups; i++) {
      const color = getDistinctLeagueGroupColor(usedGroupColors);
      usedGroupColors.push(color);

      groups.push({
        name: `Group ${groupNames[i]}`,
        participantIds: [],
        color,
      });
    }

    const baseSize = Math.floor(participants.length / numberOfGroups);
    const remainder = participants.length % numberOfGroups;

    let participantIndex = 0;
    for (let i = 0; i < numberOfGroups; i++) {
      let groupSize = baseSize;
      if (i < numberOfGroups - 1) {
        if (groupSize % 2 === 1) {
          groupSize += 1;
        }
      } else {
        groupSize = participants.length - participantIndex;
      }

      for (let j = 0; j < groupSize && participantIndex < participants.length; j++) {
        groups[i].participantIds.push(sortedParticipants[participantIndex].id);
        participantIndex++;
      }
    }

    const createdGroups: any[] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const betterGroupId: string | null = i > 0 ? createdGroups[i - 1].id : null;
      
      const createdGroup: any = await prisma.leagueGroup.create({
        data: {
          leagueSeasonId,
          name: group.name,
          betterGroupId,
          color: group.color,
        },
      });

      if (betterGroupId) {
        await prisma.leagueGroup.update({
          where: { id: betterGroupId },
          data: { worseGroupId: createdGroup.id },
        });
      }

      await prisma.leagueParticipant.updateMany({
        where: {
          id: { in: group.participantIds },
        },
        data: {
          currentGroupId: createdGroup.id,
        },
      });

      createdGroups.push(createdGroup);
    }

    return createdGroups;
  }

  static async deleteLeagueRound(leagueRoundId: string, userId: string) {
    const round = await prisma.leagueRound.findUnique({
      where: { id: leagueRoundId },
      include: {
        games: {
          select: {
            id: true,
            resultsStatus: true,
          },
        },
        leagueSeason: {
          include: {
            game: {
              include: {
                participants: {
                  where: {
                    userId,
                    role: { in: ['OWNER', 'ADMIN'] },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!round) {
      throw new ApiError(404, 'League round not found');
    }

    if (!round.leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    if (!round.leagueSeason.game) {
      throw new ApiError(404, 'League season game not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (round.leagueSeason.game.participants.length === 0 && !user.isAdmin) {
      throw new ApiError(403, 'Only owners and admins can delete league rounds');
    }

    if (round.games.some(game => game.resultsStatus !== 'NONE')) {
      throw new ApiError(400, 'Cannot delete round with completed games');
    }

    await prisma.$transaction(async tx => {
      await tx.game.deleteMany({
        where: { leagueRoundId },
      });

      await tx.leagueRound.delete({
        where: { id: leagueRoundId },
      });

      const subsequentRounds = await tx.leagueRound.findMany({
        where: {
          leagueSeasonId: round.leagueSeasonId,
          orderIndex: { gt: round.orderIndex },
        },
        orderBy: { orderIndex: 'asc' },
      });

      for (const subsequentRound of subsequentRounds) {
        await tx.leagueRound.update({
          where: { id: subsequentRound.id },
          data: {
            orderIndex: subsequentRound.orderIndex - 1,
          },
        });
      }
    });
  }
}
