import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { createLeagueGame } from '../gameCreation.util';

interface TempTeam {
  participant1Id: string;
  participant2Id: string;
  participant1: any;
  participant2: any;
}

interface TeamPair {
  player1Id: string;
  player2Id: string;
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
    const participants = await prisma.leagueParticipant.findMany({
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

    const participantIds = participants.map(p => p.userId!);

    if (participantIds.length % 2 !== 0) {
      return;
    }

    const { playedTeammates, playedOpponents } = await this.getPlayedTeamPairs(leagueSeasonId, groupId, leagueRoundId);

    const allPossibleTeams = this.generateAllTeamCombinations(participantIds);
    
    const availableTeams = allPossibleTeams.filter(team => 
      !this.hasTeamPlayed(team, playedTeammates)
    );

    const targetTeamCount = participantIds.length / 2;
    console.log(`[LEAGUE ROUND GEN] Group ${groupId}: ${participantIds.length} players, need ${targetTeamCount} teams. Available: ${availableTeams.length}/${allPossibleTeams.length} (${playedTeammates.size} teams already played)`);

    if (availableTeams.length === 0) {
      throw new ApiError(400, `No available team combinations for this round. All ${allPossibleTeams.length} possible teams have already played in this season.`);
    }

    const selectedTeams = this.selectTeamsForRound(participantIds, availableTeams, playedTeammates);

    console.log(`[LEAGUE ROUND GEN] Group ${groupId}: Selected ${selectedTeams.length} teams`);

    for (const team of selectedTeams) {
      const teamKey = [team.player1Id, team.player2Id].sort().join(',');
      if (playedTeammates.has(teamKey)) {
        throw new ApiError(500, `CRITICAL ERROR: Team ${teamKey} was selected but has already played! This should never happen.`);
      }
    }

    if (selectedTeams.length < 2) {
      throw new ApiError(400, 'Not enough teams to create games for this round');
    }

    const games = this.pairTeamsIntoGames(selectedTeams, playedOpponents);

    console.log(`[LEAGUE ROUND GEN] Group ${groupId}: Created ${games.length} games`);

    for (const game of games) {
      const team1 = this.findTeamInParticipants(game.team1, participants);
      const team2 = this.findTeamInParticipants(game.team2, participants);

      if (team1 && team2) {
        await this.createGame(
          team1,
          team2,
          leagueRoundId,
          seasonGame,
          groupId,
          leagueSeasonId
        );
      }
    }
  }

  private static async getPlayedTeamPairs(
    leagueSeasonId: string,
    groupId: string,
    currentRoundId: string
  ): Promise<{ playedTeammates: Set<string>; playedOpponents: Map<string, number> }> {
    const previousGames = await prisma.game.findMany({
      where: {
        parentId: leagueSeasonId,
        leagueGroupId: groupId,
        leagueRoundId: {
          not: currentRoundId,
        },
        hasFixedTeams: true,
      },
      include: {
        fixedTeams: {
          include: {
            players: {
              include: {
                user: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const playedTeammates = new Set<string>();
    const playedOpponents = new Map<string, number>();

    for (const game of previousGames) {
      if (game.fixedTeams.length >= 2) {
        const team1 = game.fixedTeams[0];
        const team2 = game.fixedTeams[1];

        const team1Players = team1.players.map((p: { userId: string }) => p.userId).sort();
        const team2Players = team2.players.map((p: { userId: string }) => p.userId).sort();

        if (team1Players.length === 2 && team2Players.length === 2) {
          const teammate1 = `${team1Players[0]},${team1Players[1]}`;
          const teammate2 = `${team2Players[0]},${team2Players[1]}`;
          playedTeammates.add(teammate1);
          playedTeammates.add(teammate2);

          for (const p1 of team1Players) {
            for (const p2 of team2Players) {
              const key = [p1, p2].sort().join(',');
              playedOpponents.set(key, (playedOpponents.get(key) ?? 0) + 1);
            }
          }
        }
      }
    }

    const totalOpponentPlays = [...playedOpponents.values()].reduce((a, b) => a + b, 0);
    console.log(`[LEAGUE ROUND GEN] Group ${groupId}: Found ${playedTeammates.size} played teammate pairs, ${playedOpponents.size} opponent pair keys (${totalOpponentPlays} total plays)`);

    return { playedTeammates, playedOpponents };
  }

  private static generateAllTeamCombinations(participantIds: string[]): TeamPair[] {
    const teams: TeamPair[] = [];
    const n = participantIds.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        teams.push({
          player1Id: participantIds[i],
          player2Id: participantIds[j],
        });
      }
    }

    return teams;
  }

  private static hasTeamPlayed(team: TeamPair, playedTeammates: Set<string>): boolean {
    const pairKey = [team.player1Id, team.player2Id].sort().join(',');
    return playedTeammates.has(pairKey);
  }

  private static selectTeamsForRound(
    participantIds: string[],
    availableTeams: TeamPair[],
    _playedTeammates: Set<string>
  ): TeamPair[] {
    const targetTeamCount = participantIds.length / 2;
    
    const sortedTeams = [...availableTeams].sort((_a, _b) => {
      return Math.random() - 0.5;
    });
    
    for (let attempt = 0; attempt < 10; attempt++) {
      const selectedTeams: TeamPair[] = [];
      const usedPlayers = new Set<string>();
      const teamsToTry = attempt === 0 ? sortedTeams : [...sortedTeams].sort(() => Math.random() - 0.5);

      for (const team of teamsToTry) {
        if (
          !usedPlayers.has(team.player1Id) &&
          !usedPlayers.has(team.player2Id)
        ) {
          selectedTeams.push(team);
          usedPlayers.add(team.player1Id);
          usedPlayers.add(team.player2Id);

          if (selectedTeams.length === targetTeamCount) {
            return selectedTeams;
          }
        }
      }

      if (selectedTeams.length === targetTeamCount) {
        return selectedTeams;
      }
    }

    const result = this.selectTeamsGreedy(participantIds, availableTeams);
    if (result.length >= 2) {
      return result;
    }

    throw new ApiError(400, `Could not find enough non-overlapping teams for this round. Need ${targetTeamCount} teams but only found ${result.length}`);
  }

  private static selectTeamsGreedy(
    participantIds: string[],
    availableTeams: TeamPair[]
  ): TeamPair[] {
    const selectedTeams: TeamPair[] = [];
    const usedPlayers = new Set<string>();
    const teamsByPlayerCount = new Map<number, TeamPair[]>();

    for (const team of availableTeams) {
      const overlapCount = 
        (usedPlayers.has(team.player1Id) ? 1 : 0) +
        (usedPlayers.has(team.player2Id) ? 1 : 0);
      
      if (!teamsByPlayerCount.has(overlapCount)) {
        teamsByPlayerCount.set(overlapCount, []);
      }
      teamsByPlayerCount.get(overlapCount)!.push(team);
    }

    const sortedTeams = [
      ...(teamsByPlayerCount.get(0) || []),
      ...(teamsByPlayerCount.get(1) || []),
      ...(teamsByPlayerCount.get(2) || []),
    ];

    for (const team of sortedTeams) {
      if (
        !usedPlayers.has(team.player1Id) &&
        !usedPlayers.has(team.player2Id)
      ) {
        selectedTeams.push(team);
        usedPlayers.add(team.player1Id);
        usedPlayers.add(team.player2Id);

        if (usedPlayers.size === participantIds.length) {
          break;
        }
      }
    }

    return selectedTeams;
  }

  private static pairTeamsIntoGames(
    teams: TeamPair[],
    playedOpponents: Map<string, number>
  ): Array<{ team1: TeamPair; team2: TeamPair }> {
    const games: Array<{ team1: TeamPair; team2: TeamPair }> = [];
    const availableTeams = [...teams];

    while (availableTeams.length >= 2) {
      const team1 = availableTeams[0];
      let bestOpponentIndex = -1;
      let bestUnNovelty = Infinity;

      for (let i = 1; i < availableTeams.length; i++) {
        const team2 = availableTeams[i];
        const unNovelty = this.getOpponentUnNoveltyScore(team1, team2, playedOpponents);

        if (unNovelty < bestUnNovelty) {
          bestUnNovelty = unNovelty;
          bestOpponentIndex = i;
        }
      }

      if (bestOpponentIndex === -1) {
        bestOpponentIndex = 1;
      }

      games.push({
        team1: team1,
        team2: availableTeams[bestOpponentIndex],
      });

      availableTeams.splice(bestOpponentIndex, 1);
      availableTeams.splice(0, 1);
    }

    return games;
  }

  private static getOpponentUnNoveltyScore(
    team1: TeamPair,
    team2: TeamPair,
    playedOpponents: Map<string, number>
  ): number {
    const getCount = (a: string, b: string) => playedOpponents.get([a, b].sort().join(',')) ?? 0;
    return (
      getCount(team1.player1Id, team2.player1Id) +
      getCount(team1.player1Id, team2.player2Id) +
      getCount(team1.player2Id, team2.player1Id) +
      getCount(team1.player2Id, team2.player2Id)
    );
  }

  private static findTeamInParticipants(
    team: TeamPair,
    participants: any[]
  ): TempTeam | null {
    const participant1 = participants.find(p => p.userId === team.player1Id);
    const participant2 = participants.find(p => p.userId === team.player2Id);

    if (!participant1 || !participant2) {
      return null;
    }

    return {
      participant1Id: team.player1Id,
      participant2Id: team.player2Id,
      participant1,
      participant2,
    };
  }

  private static async createGame(
    team1: TempTeam,
    team2: TempTeam,
    leagueRoundId: string,
    seasonGame: any,
    groupId: string,
    leagueSeasonId: string
  ) {
    return await createLeagueGame({
      leagueRoundId,
      seasonGame,
      leagueSeasonId,
      team1PlayerIds: [team1.participant1Id, team1.participant2Id],
      team2PlayerIds: [team2.participant1Id, team2.participant2Id],
      leagueGroupId: groupId,
      maxParticipants: 4,
      minParticipants: 4,
      isPublic: false,
      affectsRating: true,
    });
  }
}


