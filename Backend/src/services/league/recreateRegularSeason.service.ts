import { EntityType, Prisma, RoundType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { roundsInSingleRoundRobinCycle } from './generation/fixedTeamsRoundRobin';
import {
  ensureFixedTeamPairingsForRegularRound,
  loadGroupSortedTeams,
  type GroupSortedTeam,
} from './fixedTeamsRoundRobinFill';
import { findGameIdsWithNonSystemChat } from './gameChat.util';
import {
  resolveDuplicateProtectedFixtures,
  type FixtureGameForDedup,
} from './leagueFixtureGameDedup';
import {
  assertDeletableBeforeDelete,
  matchupKeyFromFixedTeamsResolved,
  type LeagueFixtureGameGuardRow,
} from './leagueFixtureGame.util';
import { LeagueStandingsRecalculateService } from './leagueStandingsRecalculate.service';
import {
  canDeleteFixtureGame,
  placeProtectedFixtureInSchedule,
} from './recreateRegularSeasonPlacement';

export interface RecreateRegularSeasonResult {
  gamesDeleted: number;
  gamesMoved: number;
  roundsDeleted: number;
  roundsCreated: number;
  roundsSkippedDueToRemainingGames: number;
  gamesCreated: number;
  gamesPreservedDueToChat: number;
  gamesPreservedFinal: number;
  gamesPreservedInProgress: number;
  gamesPreservedScheduled: number;
  standingsParticipantsReset: number;
  standingsGamesSynced: number;
}

const fixtureGameSelect = {
  id: true,
  leagueRoundId: true,
  leagueGroupId: true,
  resultsStatus: true,
  timeIsSet: true,
  clubId: true,
  courtId: true,
  fixedTeams: {
    orderBy: { teamNumber: 'asc' as const },
    include: { players: { select: { userId: true } } },
  },
  _count: { select: { outcomes: true } },
} as const;

type LoadedFixtureGame = {
  id: string;
  leagueRoundId: string | null;
  leagueGroupId: string | null;
  resultsStatus: import('@prisma/client').ResultsStatus;
  timeIsSet: boolean;
  clubId: string | null;
  courtId: string | null;
  fixedTeams: {
    teamNumber: number;
    players: { userId: string | null }[];
  }[];
  _count: { outcomes: number };
};

function toGuardRow(game: LoadedFixtureGame): LeagueFixtureGameGuardRow {
  return {
    id: game.id,
    resultsStatus: game.resultsStatus,
    timeIsSet: game.timeIsSet,
    clubId: game.clubId,
    courtId: game.courtId,
    hasOutcomes: game._count.outcomes > 0,
  };
}

export class LeagueRecreateRegularSeasonService {
  static async recreateFullRegularRoundRobin(
    leagueSeasonId: string,
    userId: string
  ): Promise<RecreateRegularSeasonResult> {
    const ctx = await this.loadPreflight(leagueSeasonId, userId);

    const stats: RecreateRegularSeasonResult = {
      gamesDeleted: 0,
      gamesMoved: 0,
      roundsDeleted: 0,
      roundsCreated: 0,
      roundsSkippedDueToRemainingGames: 0,
      gamesCreated: 0,
      gamesPreservedDueToChat: 0,
      gamesPreservedFinal: 0,
      gamesPreservedInProgress: 0,
      gamesPreservedScheduled: 0,
      standingsParticipantsReset: 0,
      standingsGamesSynced: 0,
    };

    await prisma.$transaction(
      async (tx) => {
        const regularGames = await tx.game.findMany({
          where: {
            entityType: EntityType.LEAGUE,
            leagueRound: {
              leagueSeasonId,
              roundType: RoundType.REGULAR,
            },
          },
          select: fixtureGameSelect,
        });

        const chatGameIds = await findGameIdsWithNonSystemChat(
          regularGames.map((g) => g.id),
          tx
        );

        const deletableIds: string[] = [];
        const protectedGames: FixtureGameForDedup[] = [];

        for (const game of regularGames) {
          const row = toGuardRow(game);
          if (canDeleteFixtureGame(row, chatGameIds)) {
            deletableIds.push(game.id);
          } else {
            protectedGames.push({ ...row, ...game });
          }
        }

        const dedup = resolveDuplicateProtectedFixtures(protectedGames, chatGameIds);
        deletableIds.push(...dedup.deletableIds);
        stats.gamesPreservedDueToChat += dedup.preservedDueToChat;
        stats.gamesPreservedFinal = dedup.preservedFinal;
        stats.gamesPreservedInProgress = dedup.preservedInProgress;
        stats.gamesPreservedScheduled = dedup.preservedScheduled;

        const uniqueDeletable = [...new Set(deletableIds)];
        if (uniqueDeletable.length > 0) {
          for (const id of uniqueDeletable) {
            const game = regularGames.find((g) => g.id === id);
            if (game) assertDeletableBeforeDelete(toGuardRow(game));
          }
          await tx.game.deleteMany({ where: { id: { in: uniqueDeletable } } });
          stats.gamesDeleted += uniqueDeletable.length;
        }

        const protectedByGroupKey = new Map<string, Map<string, string>>();
        for (const keeper of dedup.keepers) {
          if (!keeper.leagueGroupId || !keeper.leagueRoundId) continue;
          const key = await matchupKeyFromFixedTeamsResolved(tx, leagueSeasonId, keeper.fixedTeams);
          if (!key) continue;
          let groupMap = protectedByGroupKey.get(keeper.leagueGroupId);
          if (!groupMap) {
            groupMap = new Map();
            protectedByGroupKey.set(keeper.leagueGroupId, groupMap);
          }
          groupMap.set(key, keeper.id);
        }

        const targetRoundCount = ctx.targetRegularRounds;

        let regularRounds = await tx.leagueRound.findMany({
          where: { leagueSeasonId, roundType: RoundType.REGULAR },
          orderBy: { orderIndex: 'asc' },
        });

        const excess = regularRounds.slice(targetRoundCount);

        for (const excessRound of excess) {
          await this.purgeDeletableGamesInRound(tx, excessRound.id, chatGameIds, stats);
          const remaining = await tx.game.count({
            where: { leagueRoundId: excessRound.id, entityType: EntityType.LEAGUE },
          });
          if (remaining > 0) {
            continue;
          }
          await tx.leagueRound.delete({ where: { id: excessRound.id } });
          stats.roundsDeleted++;
        }

        await this.reindexRoundOrder(tx, leagueSeasonId);

        regularRounds = await tx.leagueRound.findMany({
          where: { leagueSeasonId, roundType: RoundType.REGULAR },
          orderBy: { orderIndex: 'asc' },
        });

        while (regularRounds.length < targetRoundCount) {
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
          regularRounds.push(round);
          stats.roundsCreated++;
        }

        const scheduleRounds = regularRounds.slice(0, targetRoundCount);
        stats.roundsSkippedDueToRemainingGames = Math.max(
          0,
          regularRounds.length - scheduleRounds.length
        );

        protectedByGroupKey.clear();
        await this.reconcileAllProtectedGames(
          tx,
          leagueSeasonId,
          scheduleRounds,
          regularRounds,
          ctx.sortedTeamsByGroupId,
          chatGameIds,
          protectedByGroupKey,
          stats
        );

        for (const excessRound of regularRounds.slice(targetRoundCount)) {
          await this.purgeDeletableGamesInRound(tx, excessRound.id, chatGameIds, stats);
          const remaining = await tx.game.count({
            where: { leagueRoundId: excessRound.id, entityType: EntityType.LEAGUE },
          });
          if (remaining === 0) {
            await tx.leagueRound.delete({ where: { id: excessRound.id } });
            stats.roundsDeleted++;
            stats.roundsSkippedDueToRemainingGames = Math.max(
              0,
              stats.roundsSkippedDueToRemainingGames - 1
            );
          }
        }

        await this.reindexRoundOrder(tx, leagueSeasonId);

        const finalScheduleRounds = (
          await tx.leagueRound.findMany({
            where: { leagueSeasonId, roundType: RoundType.REGULAR },
            orderBy: { orderIndex: 'asc' },
            take: targetRoundCount,
          })
        ).slice(0, targetRoundCount);

        for (const round of finalScheduleRounds) {
          for (const group of ctx.groups) {
            const sortedTeams = ctx.sortedTeamsByGroupId.get(group.id);
            if (!sortedTeams) continue;
            const created = await ensureFixedTeamPairingsForRegularRound(tx, {
              leagueRoundId: round.id,
              leagueRoundOrderIndex: round.orderIndex,
              leagueSeasonId,
              groupId: group.id,
              seasonGame: ctx.seasonGame,
              sortedTeams,
            });
            stats.gamesCreated += created;
          }
        }

        const standings = await LeagueStandingsRecalculateService.recalculateFromPlayedGames(
          leagueSeasonId,
          tx
        );
        stats.standingsParticipantsReset = standings.participantsReset;
        stats.standingsGamesSynced = standings.gamesSynced;
      },
      { maxWait: 20000, timeout: 120000 }
    );

    return stats;
  }

  private static async purgeDeletableGamesInRound(
    tx: Prisma.TransactionClient,
    leagueRoundId: string,
    chatGameIds: Set<string>,
    stats: RecreateRegularSeasonResult
  ) {
    const games = await tx.game.findMany({
      where: { leagueRoundId, entityType: EntityType.LEAGUE },
      select: fixtureGameSelect,
    });

    for (const game of games) {
      const row = toGuardRow(game);
      if (!canDeleteFixtureGame(row, chatGameIds)) continue;
      assertDeletableBeforeDelete(row);
      await tx.game.delete({ where: { id: game.id } });
      stats.gamesDeleted++;
    }
  }

  private static async reconcileAllProtectedGames(
    tx: Prisma.TransactionClient,
    leagueSeasonId: string,
    scheduleRounds: { id: string }[],
    allRegularRounds: { id: string }[],
    sortedTeamsByGroupId: Map<string, GroupSortedTeam[]>,
    chatGameIds: Set<string>,
    protectedByGroupKey: Map<string, Map<string, string>>,
    stats: RecreateRegularSeasonResult
  ) {
    const scheduleRoundIds = new Set(scheduleRounds.map((r) => r.id));
    const roundIdsToScan = allRegularRounds.map((r) => r.id);

    const protectedGames = await tx.game.findMany({
      where: {
        entityType: EntityType.LEAGUE,
        leagueRoundId: { in: roundIdsToScan },
      },
      select: fixtureGameSelect,
    });

    const placeParams = {
      leagueSeasonId,
      scheduleRounds,
      sortedTeamsByGroupId,
      chatGameIds,
      protectedByGroupKey,
      scheduleRoundIds,
    };

    const excessFirst = [
      ...protectedGames.filter((g) => g.leagueRoundId && !scheduleRoundIds.has(g.leagueRoundId)),
      ...protectedGames.filter((g) => g.leagueRoundId && scheduleRoundIds.has(g.leagueRoundId)),
    ];

    for (const game of excessFirst) {
      const row = toGuardRow(game);
      if (canDeleteFixtureGame(row, chatGameIds)) continue;
      const { moved, deletedDuplicateId } = await placeProtectedFixtureInSchedule(
        tx,
        { ...row, ...game },
        placeParams
      );
      if (moved) stats.gamesMoved++;
      if (deletedDuplicateId) stats.gamesDeleted++;
    }
  }

  private static async reindexRoundOrder(tx: Prisma.TransactionClient, leagueSeasonId: string) {
    const rounds = await tx.leagueRound.findMany({
      where: { leagueSeasonId },
      orderBy: { orderIndex: 'asc' },
    });
    for (let i = 0; i < rounds.length; i++) {
      if (rounds[i].orderIndex !== i) {
        await tx.leagueRound.update({
          where: { id: rounds[i].id },
          data: { orderIndex: i },
        });
        rounds[i].orderIndex = i;
      }
    }
  }

  private static async loadPreflight(leagueSeasonId: string, userId: string) {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
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
      throw new ApiError(403, 'Only owners and admins can recreate the league schedule');
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

    const existingRegularRoundCount = await prisma.leagueRound.count({
      where: { leagueSeasonId, roundType: RoundType.REGULAR },
    });

    if (existingRegularRoundCount === 0) {
      throw new ApiError(400, 'leagues.fullRoundRobin.recreate.noRegularRounds');
    }

    const sortedTeamsByGroupId = new Map<string, GroupSortedTeam[]>();
    const teamCounts: number[] = [];

    for (const g of groups) {
      const sortedTeams = await loadGroupSortedTeams(prisma, leagueSeasonId, g.id);
      if (sortedTeams.length < 2) {
        throw new ApiError(400, 'leagues.fullRoundRobin.tooFewTeams');
      }
      sortedTeamsByGroupId.set(g.id, sortedTeams);
      teamCounts.push(sortedTeams.length);
    }

    if (new Set(teamCounts).size > 1) {
      throw new ApiError(400, 'leagues.fullRoundRobin.groupsMustHaveSameTeamCount');
    }

    const targetRegularRounds = Math.max(
      0,
      ...teamCounts.map((c) => roundsInSingleRoundRobinCycle(c))
    );
    if (targetRegularRounds < 1) {
      throw new ApiError(400, 'leagues.fullRoundRobin.tooFewTeams');
    }

    return {
      seasonGame: leagueSeason.game,
      groups,
      sortedTeamsByGroupId,
      targetRegularRounds,
    };
  }
}
