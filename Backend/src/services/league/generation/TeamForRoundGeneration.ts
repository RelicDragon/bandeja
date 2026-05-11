import { RoundType } from '@prisma/client';
import prisma from '../../../config/database';
import type { GameReadinessDb } from '../../game/readiness.service';
import { ApiError } from '../../../utils/ApiError';
import { createLeagueGame } from '../gameCreation.util';
import {
  everyMatchupUntracked,
  findMinCostMaxMatching,
  matchupKeyFromSigs,
  teamPlayerSig,
} from './fixedTeamsRoundMatching';
import { pairIndicesForRoundRobinSlot, roundsInSingleRoundRobinCycle } from './fixedTeamsRoundRobin';

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

interface FixedLeagueTeamEntry {
  participant: any;
  playerIds: string[];
}

export class TeamForRoundGeneration {
  static async generateGamesForRound(leagueRoundId: string, db: GameReadinessDb = prisma) {
    const round = await db.leagueRound.findUnique({
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

    const groups = await db.leagueGroup.findMany({
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
        seasonGame,
        round.orderIndex,
        db
      );
    }

    return await db.leagueRound.findUnique({
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
    seasonGame: any,
    leagueRoundOrderIndex: number,
    db: GameReadinessDb
  ) {
    const participants = await db.leagueParticipant.findMany({
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
        leagueTeam: {
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
        },
      },
    });

    if (seasonGame.hasFixedTeams) {
      const teamParticipants = participants.filter((p) => p.participantType === 'TEAM');
      await this.generateGamesForFixedTeamsGroup(
        teamParticipants,
        leagueSeasonId,
        groupId,
        leagueRoundId,
        seasonGame,
        leagueRoundOrderIndex,
        db
      );
      return;
    }

    if (participants.length < 4) {
      return;
    }

    const participantIds = participants.map(p => p.userId!);

    if (participantIds.length % 2 !== 0) {
      return;
    }

    const { playedTeammates, playedOpponents } = await this.getPlayedTeamPairs(leagueSeasonId, groupId, leagueRoundId, db);

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
          leagueSeasonId,
          db
        );
      }
    }
  }

  private static async generateGamesForFixedTeamsGroup(
    participants: any[],
    leagueSeasonId: string,
    groupId: string,
    leagueRoundId: string,
    seasonGame: any,
    leagueRoundOrderIndex: number,
    db: GameReadinessDb
  ) {
    const fixedTeams: FixedLeagueTeamEntry[] = participants
      .filter((p) => p.participantType === 'TEAM' && p.leagueTeam?.players?.length)
      .map((p): FixedLeagueTeamEntry => ({
        participant: p,
        playerIds: Array.from(
          new Set<string>(
            p.leagueTeam.players
              .map((player: { userId: string | null }) => player.userId)
              .filter((userId: string | null): userId is string => typeof userId === 'string' && userId.trim().length > 0)
          )
        ),
      }))
      .filter((entry) => entry.playerIds.length === 2);

    if (fixedTeams.length !== participants.length) {
      throw new ApiError(400, 'Each fixed-team participant must have exactly 2 valid players');
    }

    const allPlayerIds = fixedTeams.flatMap((team) => team.playerIds);
    if (!seasonGame.allowUserInMultipleTeams && new Set(allPlayerIds).size !== allPlayerIds.length) {
      throw new ApiError(400, 'Fixed teams in a group cannot share players');
    }

    if (fixedTeams.length < 2) {
      return;
    }

    const sortedTeams = [...fixedTeams].sort((a, b) =>
      String(a.participant.id).localeCompare(String(b.participant.id))
    );
    const sigs = sortedTeams.map((t) => teamPlayerSig(t.playerIds));

    const priorRegularRounds = await db.leagueRound.count({
      where: {
        leagueSeasonId,
        roundType: RoundType.REGULAR,
        orderIndex: { lt: leagueRoundOrderIndex },
      },
    });

    const cycle = roundsInSingleRoundRobinCycle(sortedTeams.length);
    if (cycle < 1 || priorRegularRounds >= cycle) {
      return;
    }

    const playCounts = await this.getRegularSeasonFixedTeamMatchupCounts(
      leagueSeasonId,
      groupId,
      leagueRoundId,
      db
    );

    const usePureRoundRobin = everyMatchupUntracked(sigs, playCounts);
    let pairIndices: [number, number][];

    if (usePureRoundRobin) {
      const slot = priorRegularRounds % cycle;
      pairIndices = pairIndicesForRoundRobinSlot(sortedTeams.length, slot);
      console.log(
        `[LEAGUE ROUND GEN] Group ${groupId}: fixed RR circle slot ${slot}/${cycle} (prior REGULAR ${priorRegularRounds}), ${pairIndices.length} matches`
      );
    } else {
      pairIndices = findMinCostMaxMatching(sortedTeams.length, (i, j) => {
        const a = sigs[i];
        const b = sigs[j];
        if (!a || !b || a === b) return 0;
        return playCounts.get(matchupKeyFromSigs(a, b)) ?? 0;
      });
      console.log(
        `[LEAGUE ROUND GEN] Group ${groupId}: fixed adaptive matching (${pairIndices.length} matches, history-aware)`
      );
    }

    for (const [ia, ib] of pairIndices) {
      const team1 = sortedTeams[ia];
      const team2 = sortedTeams[ib];
      if (!team1 || !team2) {
        throw new ApiError(500, 'Pairing produced invalid team indices');
      }
      await createLeagueGame({
        leagueRoundId,
        seasonGame,
        leagueSeasonId,
        team1PlayerIds: team1.playerIds,
        team2PlayerIds: team2.playerIds,
        leagueGroupId: groupId,
        maxParticipants: 4,
        minParticipants: 4,
        isPublic: false,
        affectsRating: true,
        db,
      });
    }
  }

  private static async getRegularSeasonFixedTeamMatchupCounts(
    leagueSeasonId: string,
    groupId: string,
    currentRoundId: string,
    db: GameReadinessDb
  ): Promise<Map<string, number>> {
    const previousGames = await db.game.findMany({
      where: {
        parentId: leagueSeasonId,
        leagueGroupId: groupId,
        leagueRoundId: { not: currentRoundId },
        hasFixedTeams: true,
        leagueRound: { roundType: RoundType.REGULAR },
      },
      include: {
        fixedTeams: {
          orderBy: { teamNumber: 'asc' },
          include: {
            players: {
              select: { userId: true },
            },
          },
        },
      },
    });

    const counts = new Map<string, number>();
    for (const game of previousGames) {
      if (game.fixedTeams.length < 2) continue;
      const a = game.fixedTeams[0].players
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      const b = game.fixedTeams[1].players
        .map((p) => p.userId)
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      if (a.length !== 2 || b.length !== 2) continue;
      const key = matchupKeyFromSigs([...a].sort().join(','), [...b].sort().join(','));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  private static async getPlayedTeamPairs(
    leagueSeasonId: string,
    groupId: string,
    currentRoundId: string,
    db: GameReadinessDb
  ): Promise<{ playedTeammates: Set<string>; playedOpponents: Map<string, number> }> {
    const previousGames = await db.game.findMany({
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
              if (p1 === p2) continue;
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
    const getCount = (a: string, b: string) =>
      a === b ? 0 : playedOpponents.get([a, b].sort().join(',')) ?? 0;
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
    leagueSeasonId: string,
    db: GameReadinessDb
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
      db,
    });
  }
}


