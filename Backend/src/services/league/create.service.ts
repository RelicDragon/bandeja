import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  EntityType,
  GameType,
  WinnerOfGame,
  WinnerOfMatch,
  RoundType,
  ScoringPreset,
  Sport,
} from '@prisma/client';
import { resolvePlayersPerMatch } from '../../sport/sportRegistry';
import { validateGameForSport } from '../../utils/validators/validateGameForSport';
import { resolveLeagueSeasonSportFromInput } from '../../utils/validators/validateLeagueSeasonSport';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../../utils/constants';
import { resolveUserSportSnapshot } from '../user/userSportProfile.service';
import { getDistinctLeagueGroupColor } from './groupColors';
import {
  createLeagueGame,
  createLeaguePlayoffGame,
  PlayoffGameSetupOverrides,
  validatePlayoffGameSetupForSeason,
} from './gameCreation.util';
import { resolveLeagueSeasonSport } from '../../utils/validators/validateLeagueSeasonSport';
import { resolveMatchGenerationType } from '../../utils/game/resolveMatchGenerationType';
import { deriveBallsInGamesFromScoring } from '../../utils/scoring/deriveBallsInGames';
import { TeamForRoundGeneration } from './generation/TeamForRoundGeneration';
import { roundsInSingleRoundRobinCycle } from './generation/fixedTeamsRoundRobin';
import { teamPlayerSig } from './generation/fixedTeamsRoundMatching';
import { assertMaxParticipantsWithinUserCap } from '../../utils/game/userMaxParticipantsCap';
import {
  ensureTeamLeagueParticipant,
  ensureUserLeagueParticipant,
  findTeamParticipantByRoster,
} from './leagueParticipantResolve';
import { playersPerTeamOf } from '../results/generation/matchUtils';

export class LeagueCreateService {
  private static getSeasonParticipantType(hasFixedTeams: boolean) {
    return hasFixedTeams ? 'TEAM' as const : 'USER' as const;
  }

  /**
   * Manual "Create game" for a fixed-team round: prefer teams that have met the fewest times,
   * then pairs with the lowest combined season game load. Skips teams already in a game this round.
   */
  private static async pickBestFixedTeamPairForManualRound(params: {
    leagueSeasonId: string;
    leagueRoundId: string;
    leagueGroupId?: string;
    standings: any[];
    allowUserInMultipleTeams: boolean;
    seasonGame: { playersPerMatch?: number | null };
  }): Promise<{ first: any; second: any }> {
    const { leagueSeasonId, leagueRoundId, leagueGroupId, standings, allowUserInMultipleTeams, seasonGame } = params;
    const playersPerTeam = playersPerTeamOf(seasonGame);

    const teamRows = standings.filter(
      (s: any) =>
        s.participantType === 'TEAM' &&
        s.leagueTeamId &&
        s.leagueTeam &&
        Array.isArray(s.leagueTeam.players) &&
        s.leagueTeam.players.length === playersPerTeam
    );

    if (teamRows.length < 2) {
      throw new ApiError(400, 'Not enough fixed teams in this group to create a game');
    }

    const sigToTid = new Map<string, string>();
    const tidToUserSet = new Map<string, Set<string>>();

    for (const row of teamRows) {
      const ids = row.leagueTeam.players
        .map((p: { userId: string | null }) => p.userId)
        .filter((id: string | null | undefined): id is string => typeof id === 'string' && id.trim().length > 0);
      if (ids.length !== playersPerTeam) continue;
      const sig = teamPlayerSig(ids);
      sigToTid.set(sig, row.leagueTeamId as string);
      tidToUserSet.set(row.leagueTeamId as string, new Set(ids));
    }

    const groupScopeIds = leagueGroupId
      ? [leagueGroupId]
      : [
          ...new Set(
            teamRows
              .map((r: any) => r.currentGroupId as string | null | undefined)
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
          ),
        ];

    const leagueGameWhere: {
      parentId: string;
      entityType: typeof EntityType.LEAGUE;
      leagueGroupId?: string | { in: string[] };
    } = {
      parentId: leagueSeasonId,
      entityType: EntityType.LEAGUE,
    };
    if (leagueGroupId) {
      leagueGameWhere.leagueGroupId = leagueGroupId;
    } else if (groupScopeIds.length > 0) {
      leagueGameWhere.leagueGroupId = { in: groupScopeIds };
    }

    const seasonGames = await prisma.game.findMany({
      where: leagueGameWhere,
      select: {
        id: true,
        leagueRoundId: true,
        fixedTeams: {
          orderBy: { teamNumber: 'asc' },
          select: {
            players: { select: { userId: true } },
          },
        },
      },
    });

    const resolveTids = (game: (typeof seasonGames)[number]): [string | null, string | null] => {
      if (game.fixedTeams.length < 2) return [null, null];
      const a = game.fixedTeams[0].players.map((p) => p.userId).filter(Boolean) as string[];
      const b = game.fixedTeams[1].players.map((p) => p.userId).filter(Boolean) as string[];
      if (a.length !== playersPerTeam || b.length !== playersPerTeam) return [null, null];
      const tA = sigToTid.get(teamPlayerSig(a)) ?? null;
      const tB = sigToTid.get(teamPlayerSig(b)) ?? null;
      return [tA, tB];
    };

    const busyTids = new Set<string>();
    const matchupCounts = new Map<string, number>();
    const gamesPerTid = new Map<string, number>();

    for (const tid of sigToTid.values()) {
      gamesPerTid.set(tid, 0);
    }

    for (const g of seasonGames) {
      const [t1, t2] = resolveTids(g);
      if (!t1 || !t2 || t1 === t2) continue;

      const mkey = t1 < t2 ? `${t1}|${t2}` : `${t2}|${t1}`;
      matchupCounts.set(mkey, (matchupCounts.get(mkey) ?? 0) + 1);
      gamesPerTid.set(t1, (gamesPerTid.get(t1) ?? 0) + 1);
      gamesPerTid.set(t2, (gamesPerTid.get(t2) ?? 0) + 1);

      if (g.leagueRoundId === leagueRoundId) {
        busyTids.add(t1);
        busyTids.add(t2);
      }
    }

    const teamsList = [...sigToTid.values()].sort();

    let best: { ta: string; tb: string; m: number; g: number } | null = null;

    for (let i = 0; i < teamsList.length; i++) {
      for (let j = i + 1; j < teamsList.length; j++) {
        const ta = teamsList[i]!;
        const tb = teamsList[j]!;
        if (busyTids.has(ta) || busyTids.has(tb)) continue;

        if (!allowUserInMultipleTeams) {
          const sa = tidToUserSet.get(ta);
          const sb = tidToUserSet.get(tb);
          if (sa && sb && [...sa].some((u) => sb.has(u))) continue;
        }

        const mkey = ta < tb ? `${ta}|${tb}` : `${tb}|${ta}`;
        const m = matchupCounts.get(mkey) ?? 0;
        const gsum = (gamesPerTid.get(ta) ?? 0) + (gamesPerTid.get(tb) ?? 0);
        const cand = { ta, tb, m, g: gsum };
        if (
          best === null ||
          cand.m < best.m ||
          (cand.m === best.m && cand.g < best.g) ||
          (cand.m === best.m && cand.g === best.g && cand.ta < best.ta) ||
          (cand.m === best.m && cand.g === best.g && cand.ta === best.ta && cand.tb < best.tb)
        ) {
          best = cand;
        }
      }
    }

    if (!best) {
      throw new ApiError(
        400,
        'No available team pairing for this round (teams may already be scheduled or rosters overlap).'
      );
    }

    const first = teamRows.find((r: any) => r.leagueTeamId === best.ta);
    const second = teamRows.find((r: any) => r.leagueTeamId === best.tb);
    if (!first || !second) {
      throw new ApiError(500, 'Could not resolve best league pairing');
    }
    return { first, second };
  }

  private static getLeagueParticipantSortLevel(
    participant: any,
    hasFixedTeams: boolean,
    seasonSport: Sport,
  ): number {
    if (!hasFixedTeams) {
      return participant.user
        ? resolveUserSportSnapshot(participant.user, seasonSport).level
        : 0;
    }

    const teamPlayers = participant.leagueTeam?.players ?? [];
    if (teamPlayers.length === 0) {
      return 0;
    }

    const total = teamPlayers.reduce(
      (sum: number, p: any) =>
        sum + (p.user ? resolveUserSportSnapshot(p.user, seasonSport).level : 0),
      0,
    );
    return total / teamPlayers.length;
  }

  static async createLeague(data: any, userId: string, jwtIsAdmin: boolean = false) {
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

    const actor = await prisma.user.findUnique({
      where: { id: userId },
      select: { canCreateTournament: true, maxParticipantsInGame: true },
    });
    assertMaxParticipantsWithinUserCap({
      jwtIsAdmin,
      actor,
      maxParticipants,
      entityType: EntityType.LEAGUE_SEASON,
    });

    const gameSeasonData = data.season.gameSeason || {};
    const seasonName = data.season.name?.trim() || '';
    const seasonSport = validateGameForSport({
      sport: resolveLeagueSeasonSportFromInput(data.season.sport),
      entityType: EntityType.LEAGUE_SEASON,
      gameType: (gameSeasonData.gameType as string) ?? GameType.CLASSIC,
      maxParticipants,
      scoringPreset: gameSeasonData.scoringPreset ?? null,
    });
    const seasonPlayersPerMatch = resolvePlayersPerMatch(
      seasonSport,
      (gameSeasonData as { playersPerMatch?: number }).playersPerMatch,
    );

    const gameSeasonGame = await prisma.game.create({
      data: {
        entityType: 'LEAGUE_SEASON' as EntityType,
        sport: seasonSport,
        gameType: (gameSeasonData.gameType as GameType) ?? GameType.CLASSIC,
        name: seasonName,
        avatar: data.season?.avatar,
        originalAvatar: data.season?.originalAvatar,
        fixedNumberOfSets: gameSeasonData.fixedNumberOfSets ?? 0,
        maxTotalPointsPerSet: gameSeasonData.maxTotalPointsPerSet ?? 0,
        maxPointsPerTeam: gameSeasonData.maxPointsPerTeam ?? 0,
        matchTimedCapMinutes: gameSeasonData.matchTimedCapMinutes ?? 0,
        matchTimerEnabled: Boolean(gameSeasonData.matchTimerEnabled),
        winnerOfGame: (gameSeasonData.winnerOfGame as WinnerOfGame) ?? WinnerOfGame.BY_MATCHES_WON,
        winnerOfMatch: (gameSeasonData.winnerOfMatch as WinnerOfMatch) ?? WinnerOfMatch.BY_SCORES,
        matchGenerationType: resolveMatchGenerationType({
          resultsRoundGenV2: data.resultsRoundGenV2,
          matchGenerationType: gameSeasonData.matchGenerationType,
          maxParticipants,
          playersPerMatch: seasonPlayersPerMatch,
        }),
        pointsPerWin: gameSeasonData.pointsPerWin ?? 0,
        pointsPerLoose: gameSeasonData.pointsPerLoose ?? 0,
        pointsPerTie: gameSeasonData.pointsPerTie ?? 0,
        scoringPreset: (gameSeasonData.scoringPreset as ScoringPreset | null) ?? null,
        scoringMode: gameSeasonData.scoringMode != null ? String(gameSeasonData.scoringMode) : null,
        hasGoldenPoint: gameSeasonData.hasGoldenPoint ?? false,
        ballsInGames:
          typeof gameSeasonData.ballsInGames === 'boolean'
            ? gameSeasonData.ballsInGames
            : deriveBallsInGamesFromScoring({
                scoringPreset: gameSeasonData.scoringPreset ?? null,
                winnerOfMatch: (gameSeasonData.winnerOfMatch as WinnerOfMatch) ?? WinnerOfMatch.BY_SCORES,
                maxTotalPointsPerSet: gameSeasonData.maxTotalPointsPerSet ?? 0,
              }),
        hasFixedTeams: data.hasFixedTeams ?? false,
        allowUserInMultipleTeams:
          seasonPlayersPerMatch === 2 || !data.hasFixedTeams
            ? false
            : Boolean(data.allowUserInMultipleTeams),
        cityId: data.cityId,
        clubId: data.clubId || null,
        startTime: startDate,
        endTime: startDate,
        maxParticipants,
        playersPerMatch: seasonPlayersPerMatch,
        minParticipants: 0,
        minLevel,
        maxLevel,
        status: 'ANNOUNCED',
        participants: {
          create: {
            userId: userId,
            role: 'OWNER',
            status: 'IN_QUEUE',
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
            sport: seasonSport,
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
        await TeamForRoundGeneration.generateGamesForRound(leagueRoundId);
        break;
      default:
        break;
    }
  }

  static async createFullRegularRoundRobin(leagueSeasonId: string, userId: string) {
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

    if (!leagueSeason.game.hasFixedTeams) {
      throw new ApiError(400, 'leagues.fullRoundRobin.requiresFixedTeams');
    }

    const groups = await prisma.leagueGroup.findMany({
      where: { leagueSeasonId },
      orderBy: { createdAt: 'asc' },
    });

    if (groups.length === 0) {
      throw new ApiError(400, 'leagues.fullRoundRobin.noGroups');
    }

    const teamCounts: number[] = [];

    for (const g of groups) {
      const participants = await prisma.leagueParticipant.findMany({
        where: { leagueSeasonId, currentGroupId: g.id },
        include: {
          leagueTeam: {
            include: {
              players: { select: { userId: true } },
            },
          },
        },
      });

      const readyTeamCount = participants.filter((p) => {
        if (p.participantType !== 'TEAM' || !p.leagueTeam?.players?.length) return false;
        const ids = new Set(
          p.leagueTeam.players
            .map((pl) => pl.userId)
            .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        );
        return ids.size === 2;
      }).length;

      if (readyTeamCount !== participants.length || readyTeamCount < 2) {
        throw new ApiError(400, 'leagues.fullRoundRobin.invalidTeamParticipants');
      }

      teamCounts.push(readyTeamCount);
    }

    const roundsToCreate = Math.max(0, ...teamCounts.map((c) => roundsInSingleRoundRobinCycle(c)));
    if (roundsToCreate < 1) {
      throw new ApiError(400, 'leagues.fullRoundRobin.tooFewTeams');
    }

    const existingRegularRoundCount = await prisma.leagueRound.count({
      where: { leagueSeasonId, roundType: RoundType.REGULAR },
    });

    if (existingRegularRoundCount > 0) {
      throw new ApiError(409, 'leagues.fullRoundRobin.regularRoundsAlreadyExist');
    }

    await prisma.$transaction(
      async (tx) => {
        for (let i = 0; i < roundsToCreate; i++) {
          const last = await tx.leagueRound.findFirst({
            where: { leagueSeasonId },
            orderBy: { orderIndex: 'desc' },
          });
          const nextOrderIndex = last ? last.orderIndex + 1 : 0;
          const round = await tx.leagueRound.create({
            data: {
              leagueSeasonId,
              orderIndex: nextOrderIndex,
              roundType: RoundType.REGULAR,
            },
          });
          await TeamForRoundGeneration.generateGamesForRound(round.id, tx);
        }
      },
      { maxWait: 20000, timeout: 120000 }
    );

    return { roundsCreated: roundsToCreate };
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
        participantType: this.getSeasonParticipantType(hasFixedTeams),
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

    const playersPerTeam = playersPerTeamOf(seasonGame);

    if (hasFixedTeams) {
      for (const fixedTeam of seasonGame.fixedTeams) {
        const teamPlayerIds = fixedTeam.players.map((p) => p.userId);
        if (teamPlayerIds.length !== playersPerTeam) continue;

        const existingTeam = await findTeamParticipantByRoster(
          prisma,
          round.leagueSeasonId,
          teamPlayerIds
        );
        if (!existingTeam) {
          await ensureTeamLeagueParticipant(prisma, {
            leagueId,
            leagueSeasonId: round.leagueSeasonId,
            teamPlayerIds,
            leagueGroupId,
          });
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
          await ensureUserLeagueParticipant(prisma, {
            leagueId,
            leagueSeasonId: round.leagueSeasonId,
            userId: participant.userId,
            leagueGroupId,
          });
        }
      }
    }

    const updatedStandings = await prisma.leagueParticipant.findMany({
      where: {
        leagueSeasonId: round.leagueSeasonId,
        participantType: this.getSeasonParticipantType(hasFixedTeams),
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

    let team1Standing: (typeof updatedStandings)[number];
    let team2Standing: (typeof updatedStandings)[number];

    if (hasFixedTeams) {
      const picked = await this.pickBestFixedTeamPairForManualRound({
        leagueSeasonId: round.leagueSeasonId,
        leagueRoundId,
        leagueGroupId,
        standings: updatedStandings,
        allowUserInMultipleTeams: Boolean(seasonGame.allowUserInMultipleTeams),
        seasonGame,
      });
      team1Standing = picked.first;
      team2Standing = picked.second;
    } else {
      team1Standing = updatedStandings[0];
      team2Standing = updatedStandings[1];

      let team2Index = 1;
      while (team2Index < updatedStandings.length && team2Standing.userId === team1Standing.userId) {
        team2Index++;
        if (team2Index < updatedStandings.length) {
          team2Standing = updatedStandings[team2Index];
        }
      }

      if (team2Standing.userId === team1Standing.userId) {
        throw new ApiError(400, 'Not enough different participants in standings to create a game');
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

    const createdGame = await createLeagueGame({
      leagueRoundId,
      seasonGame,
      leagueSeasonId: round.leagueSeasonId,
      team1PlayerIds,
      team2PlayerIds,
      leagueGroupId,
      isPublic: false,
      affectsRating: seasonGame.affectsRating,
    });

    const game = await prisma.game.findUnique({
      where: { id: createdGame.id },
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

    if (!game) {
      throw new ApiError(500, 'Failed to fetch created game');
    }

    return game;
  }

  static async createPlayoff(
    leagueSeasonId: string,
    userId: string,
    payload: {
      gameType: 'WINNER_COURT' | 'AMERICANO';
      participantIds?: string[];
      leagueGroupId?: string;
      groups?: { leagueGroupId: string; participantIds: string[] }[];
      gameSetup?: PlayoffGameSetupOverrides;
      resultsRoundGenV2?: boolean;
    }
  ): Promise<{ round: any; game?: any; games?: any[] }> {
    const { gameType, groups, gameSetup, resultsRoundGenV2 } = payload;

    if (groups !== undefined) {
      if (groups.length === 0) {
        throw new ApiError(400, 'groups must not be empty when provided');
      }
      return this.createPlayoffBatch(leagueSeasonId, userId, gameType, groups, gameSetup, resultsRoundGenV2);
    }

    const { participantIds, leagueGroupId } = payload;
    if (!participantIds || participantIds.length < 4) {
      throw new ApiError(400, 'At least 4 participants are required for playoff');
    }
    if (new Set(participantIds).size !== participantIds.length) {
      throw new ApiError(400, 'participantIds must be distinct');
    }

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
      throw new ApiError(403, 'Only owners and admins can create playoff');
    }

    const seasonSport = resolveLeagueSeasonSport(leagueSeason);
    validatePlayoffGameSetupForSeason(seasonSport, leagueSeason.game, gameSetup, { gameType });

    const participants = await prisma.leagueParticipant.findMany({
      where: {
        id: { in: participantIds },
        leagueSeasonId,
        ...(leagueGroupId ? { currentGroupId: leagueGroupId } : {}),
      },
      include: {
        user: { select: USER_SELECT_FIELDS },
        leagueTeam: {
          include: {
            players: {
              include: { user: { select: USER_SELECT_FIELDS } },
            },
          },
        },
      },
    });

    if (participants.length !== participantIds.length) {
      throw new ApiError(400, 'Invalid or duplicate participant selection');
    }

    const hasFixedTeams = leagueSeason.game.hasFixedTeams ?? false;
    let participantUserIds: string[] = [];
    let teams: string[][] | undefined;

    if (hasFixedTeams) {
      teams = participants
        .filter((p) => p.leagueTeam?.players?.length)
        .map((p) => p.leagueTeam!.players.map((pl) => pl.userId));
      participantUserIds = teams.flatMap((t) => t);
    } else {
      participantUserIds = participants.map((p) => p.userId!).filter(Boolean);
    }

    if (participantUserIds.length < 4) {
      throw new ApiError(400, 'At least 4 participants are required for playoff');
    }

    const seasonGame = await prisma.game.findUnique({
      where: { id: leagueSeason.game.id },
      include: {
        participants: { include: { user: { select: USER_SELECT_FIELDS } } },
        fixedTeams: {
          include: {
            players: { include: { user: { select: USER_SELECT_FIELDS } } },
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    let round: any;
    let game: any;
    await prisma.$transaction(async (tx) => {
      const existingRounds = await tx.leagueRound.findMany({
        where: { leagueSeasonId },
        orderBy: { orderIndex: 'desc' },
        take: 1,
      });
      const nextOrderIndex = existingRounds.length > 0 ? existingRounds[0].orderIndex + 1 : 0;
      round = await tx.leagueRound.create({
        data: {
          leagueSeasonId,
          orderIndex: nextOrderIndex,
          roundType: RoundType.PLAYOFF,
        },
      });
      game = await createLeaguePlayoffGame(
        {
          leagueRoundId: round.id,
          leagueSeasonId,
          seasonGame,
          gameType,
          participantUserIds,
          leagueGroupId,
          teams,
          gameSetup,
          resultsRoundGenV2,
        },
        tx
      );
    });

    const { GameService } = await import('../game/game.service');
    await GameService.updateGameReadiness(game.id);

    return { round, game };
  }

  private static async createPlayoffBatch(
    leagueSeasonId: string,
    userId: string,
    gameType: 'WINNER_COURT' | 'AMERICANO',
    groups: { leagueGroupId: string; participantIds: string[] }[],
    gameSetup?: import('./gameCreation.util').PlayoffGameSetupOverrides,
    resultsRoundGenV2?: boolean
  ): Promise<{ round: any; games: any[] }> {
    const MIN = 4;
    for (const g of groups) {
      if (!g.participantIds?.length || g.participantIds.length < MIN) {
        throw new ApiError(400, `Each group must have at least ${MIN} participants`);
      }
      if (new Set(g.participantIds).size !== g.participantIds.length) {
        throw new ApiError(400, 'participantIds must be distinct per group');
      }
    }
    const groupIds = groups.map((g) => g.leagueGroupId);
    if (new Set(groupIds).size !== groupIds.length) {
      throw new ApiError(400, 'Duplicate leagueGroupId in groups');
    }

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
      throw new ApiError(403, 'Only owners and admins can create playoff');
    }

    const seasonSport = resolveLeagueSeasonSport(leagueSeason);
    validatePlayoffGameSetupForSeason(seasonSport, leagueSeason.game, gameSetup, { gameType });

    const seasonGroupIds = new Set(
      (await prisma.leagueGroup.findMany({ where: { leagueSeasonId }, select: { id: true } })).map((x) => x.id)
    );
    for (const g of groups) {
      if (!seasonGroupIds.has(g.leagueGroupId)) {
        throw new ApiError(400, 'One or more groups do not belong to this league season');
      }
    }

    const seasonGame = await prisma.game.findUnique({
      where: { id: leagueSeason.game.id },
      include: {
        participants: { include: { user: { select: USER_SELECT_FIELDS } } },
        fixedTeams: {
          include: {
            players: { include: { user: { select: USER_SELECT_FIELDS } } },
          },
          orderBy: { teamNumber: 'asc' },
        },
      },
    });

    if (!seasonGame) {
      throw new ApiError(404, 'League season game not found');
    }

    const hasFixedTeams = leagueSeason.game.hasFixedTeams ?? false;
    const groupsData: { leagueGroupId: string; participantUserIds: string[]; teams?: string[][] }[] = [];

    for (const g of groups) {
      const participants = await prisma.leagueParticipant.findMany({
        where: {
          id: { in: g.participantIds },
          leagueSeasonId,
          currentGroupId: g.leagueGroupId,
        },
        include: {
          user: { select: USER_SELECT_FIELDS },
          leagueTeam: {
            include: {
              players: {
                include: { user: { select: USER_SELECT_FIELDS } },
              },
            },
          },
        },
      });

      if (participants.length !== g.participantIds.length) {
        throw new ApiError(400, 'Invalid or duplicate participant selection for a group');
      }

      let participantUserIds: string[];
      let teams: string[][] | undefined;
      if (hasFixedTeams) {
        teams = participants
          .filter((p) => p.leagueTeam?.players?.length)
          .map((p) => p.leagueTeam!.players.map((pl) => pl.userId));
        participantUserIds = teams.flatMap((t) => t);
      } else {
        participantUserIds = participants.map((p) => p.userId!).filter(Boolean);
      }

      if (participantUserIds.length < MIN) {
        throw new ApiError(400, `At least ${MIN} participants are required per group`);
      }

      groupsData.push({ leagueGroupId: g.leagueGroupId, participantUserIds, teams });
    }

    let round: any;
    const games: any[] = [];

    await prisma.$transaction(async (tx) => {
      const existingRounds = await tx.leagueRound.findMany({
        where: { leagueSeasonId },
        orderBy: { orderIndex: 'desc' },
        take: 1,
      });
      const nextOrderIndex = existingRounds.length > 0 ? existingRounds[0].orderIndex + 1 : 0;
      round = await tx.leagueRound.create({
        data: {
          leagueSeasonId,
          orderIndex: nextOrderIndex,
          roundType: RoundType.PLAYOFF,
        },
      });

      for (const gd of groupsData) {
        const game = await createLeaguePlayoffGame(
          {
            leagueRoundId: round.id,
            leagueSeasonId,
            seasonGame,
            gameType,
            participantUserIds: gd.participantUserIds,
            leagueGroupId: gd.leagueGroupId,
            teams: gd.teams,
            gameSetup,
            resultsRoundGenV2,
          },
          tx
        );
        games.push(game);
      }
    });

    const { GameService } = await import('../game/game.service');
    for (const game of games) {
      await GameService.updateGameReadiness(game.id);
    }

    return { round, games };
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
      where: {
        leagueSeasonId,
        participantType: this.getSeasonParticipantType(leagueSeason.game.hasFixedTeams || false),
      },
      include: {
        user: {
          select: {
            ...USER_SELECT_FIELDS,
            sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
          },
        },
        leagueTeam: {
          include: {
            players: {
              include: {
                user: {
                  select: {
                    ...USER_SELECT_FIELDS,
                    sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
                  },
                },
              },
            },
          },
        },
      },
    });

    const hasFixedTeams = leagueSeason.game.hasFixedTeams || false;
    const minParticipantsPerGroup = hasFixedTeams ? 2 : 4;
    const minGroups = 1;
    const maxGroups = Math.floor(participants.length / minParticipantsPerGroup);

    if (participants.length < minParticipantsPerGroup) {
      throw new ApiError(400, `At least ${minParticipantsPerGroup} participants are required to create groups`);
    }

    if (numberOfGroups < minGroups || numberOfGroups > maxGroups) {
      throw new ApiError(400, `Number of groups must be between ${minGroups} and ${maxGroups}`);
    }

    const seasonSport = leagueSeason.sport;
    const sortedParticipants = participants.sort((a, b) => {
      const aLevel = this.getLeagueParticipantSortLevel(a, hasFixedTeams, seasonSport);
      const bLevel = this.getLeagueParticipantSortLevel(b, hasFixedTeams, seasonSport);
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

    let participantIndex = 0;
    for (let i = 0; i < numberOfGroups; i++) {
      let groupSize = baseSize;
      if (i < numberOfGroups - 1) {
        if (hasFixedTeams && groupSize % 2 === 1) {
          groupSize += 1;
        } else if (!hasFixedTeams && groupSize % 2 === 1) {
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
