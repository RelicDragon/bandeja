import { Prisma } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  filterThresholdDefinitionsDue,
  userSideWonTieBreakSet,
  type AchievementDefinition,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { achievementPlayAt } from './achievementPlayAt';
import {
  AchievementStatsRefreshError,
  beginAchievementStatsRefresh,
  commitTieBreakAchievementStatsIfUnchanged,
  lockAchievementStatsWrite,
  readTieBreakAchievementStats,
  upsertTieBreakAchievementStats,
} from './achievementStats.service';
import { attachHabitUnlocksToGameOutcome } from './habitUnlockAttach.service';
import type { HabitGrantResult, HabitUnlockMeta } from './habitGrant.service';

type DbClient = Prisma.TransactionClient | typeof prisma;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toUnlockMeta(
  definition: AchievementDefinition,
  achievementId: string,
): HabitUnlockMeta {
  return {
    definitionId: definition.id,
    rarity: definition.rarity,
    artKey: definition.artKey,
    titleKey: definition.titleKey,
    achievementId,
  };
}

export async function countTieBreakSetWins(params: {
  userId: string;
  excludeGameId?: string | null;
  tx?: DbClient;
}): Promise<number> {
  const db = params.tx ?? prisma;
  const exclude = params.excludeGameId
    ? Prisma.sql`AND g.id <> ${params.excludeGameId}`
    : Prisma.sql``;
  const rows = await db.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n
    FROM "Set" s
    INNER JOIN "Match" m ON m.id = s."matchId"
    INNER JOIN "Round" r ON r.id = m."roundId"
    INNER JOIN "Game" g ON g.id = r."gameId"
    INNER JOIN "Team" t ON t."matchId" = m.id
    INNER JOIN "TeamPlayer" tp ON tp."teamId" = t.id
    WHERE tp."userId" = ${params.userId}
      AND s.role = 'OFFICIAL'
      AND g."resultsStatus" = 'FINAL'
      AND (
        s."isTieBreak" = true
        OR (
          GREATEST(s."teamAScore", s."teamBScore") = 7
          AND LEAST(s."teamAScore", s."teamBScore") = 6
        )
      )
      AND (
        (t."teamNumber" = 1 AND s."teamAScore" > s."teamBScore")
        OR (t."teamNumber" = 2 AND s."teamBScore" > s."teamAScore")
      )
      ${exclude}
  `;
  return Number(rows[0]?.n ?? 0);
}

export async function loadTieBreakHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<{ tieBreakSetWins: number }> {
  const cached = await readTieBreakAchievementStats(userId, tx);
  if (cached) return cached;
  return refreshTieBreakHabitCounters(userId, tx);
}

export async function refreshTieBreakHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<{ tieBreakSetWins: number }> {
  const startedRevision = await beginAchievementStatsRefresh(userId, tx);
  try {
    const tieBreakSetWins = await countTieBreakSetWins({ userId, tx });
    const tiebreak = { tieBreakSetWins };
    await commitTieBreakAchievementStatsIfUnchanged({
      userId,
      startedRevision,
      tiebreak,
      tx,
    });
    return tiebreak;
  } catch (error) {
    throw new AchievementStatsRefreshError(startedRevision, error);
  }
}

export async function grantTieBreakAchievementsForFinalizedGame(params: {
  gameId: string;
  tx?: Prisma.TransactionClient;
}): Promise<HabitGrantResult> {
  if (!params.tx) {
    return prisma.$transaction((tx) =>
      grantTieBreakAchievementsForFinalizedGame({
        gameId: params.gameId,
        tx,
      }),
    );
  }
  const db = params.tx;
  const game = await db.game.findUnique({
    where: { id: params.gameId },
    select: {
      id: true,
      sport: true,
      resultsStatus: true,
      entityType: true,
    },
  });
  if (!game || game.resultsStatus !== 'FINAL') {
    return { granted: [], unlocks: [] };
  }

  const participantIds = await db.teamPlayer.findMany({
    where: {
      team: { match: { round: { gameId: game.id } } },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (participantIds.length === 0) return { granted: [], unlocks: [] };

  const sets = await db.set.findMany({
    where: { match: { round: { gameId: game.id } }, role: 'OFFICIAL' },
    select: {
      teamAScore: true,
      teamBScore: true,
      isTieBreak: true,
      match: { select: { teams: { select: { teamNumber: true, players: { select: { userId: true } } } } } },
    },
  });

  const deltaByUser = new Map<string, number>();
  for (const set of sets) {
    for (const team of set.match.teams) {
      if (
        !userSideWonTieBreakSet({
          teamNumber: team.teamNumber,
          set: {
            teamAScore: set.teamAScore,
            teamBScore: set.teamBScore,
            isTieBreak: set.isTieBreak,
          },
        })
      ) {
        continue;
      }
      for (const player of team.players) {
        deltaByUser.set(player.userId, (deltaByUser.get(player.userId) ?? 0) + 1);
      }
    }
  }

  const allGranted: AchievementDefinition[] = [];
  const allUnlocks: HabitUnlockMeta[] = [];
  const sortedIds = [...participantIds.map((p) => p.userId)].sort((a, b) =>
    a.localeCompare(b),
  );

  for (const userId of sortedIds) {
    await lockAchievementStatsWrite({ userId, kind: 'tiebreak', tx: db });
    const afterCount = await countTieBreakSetWins({ userId, tx: db });
    const beforeCount = afterCount - (deltaByUser.get(userId) ?? 0);
    await upsertTieBreakAchievementStats({
      userId,
      tiebreak: { tieBreakSetWins: afterCount },
      tx: db,
    });
    if (afterCount <= beforeCount) continue;

    const existing = await db.userAchievement.findMany({
      where: { userId },
      select: { definitionId: true },
    });
    const due = filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_TIE_BREAK',
      before: Math.max(0, beforeCount),
      after: afterCount,
      ownedDefinitionIds: new Set(existing.map((r) => r.definitionId)),
    });
    if (due.length === 0) continue;

    for (const definition of due) {
      try {
        const row = await db.userAchievement.create({
          data: {
            userId,
            definitionId: definition.id,
            sourceKey: '',
            sport: game.sport,
            sourceGameId: game.id,
            sourceEntityType: game.entityType,
            sourceEntityId: game.id,
            isActive: true,
          },
        });
        allGranted.push(definition);
        const meta = toUnlockMeta(definition, row.id);
        allUnlocks.push(meta);
        await attachHabitUnlocksToGameOutcome({
          db,
          gameId: game.id,
          userId,
          unlocks: [meta],
        });
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
  }

  return { granted: allGranted, unlocks: allUnlocks };
}

export async function loadTieBreakWinsChronological(params: {
  userId: string;
  tx?: DbClient;
}): Promise<Array<{ gameId: string; at: Date }>> {
  const db = params.tx ?? prisma;
  const rows = await db.set.findMany({
    where: {
      role: 'OFFICIAL',
      match: {
        round: {
          game: { resultsStatus: 'FINAL' },
        },
        teams: {
          some: {
            players: { some: { userId: params.userId } },
          },
        },
      },
    },
    select: {
      teamAScore: true,
      teamBScore: true,
      isTieBreak: true,
      match: {
        select: {
          teams: {
            select: {
              teamNumber: true,
              players: { select: { userId: true } },
            },
          },
          round: {
            select: {
              game: {
                select: {
                  id: true,
                  finishedDate: true,
                  endTime: true,
                  startTime: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const out: Array<{ gameId: string; at: Date }> = [];
  for (const row of rows) {
    const game = row.match.round.game;
    const userTeam = row.match.teams.find((t) =>
      t.players.some((p) => p.userId === params.userId),
    );
    if (!userTeam) continue;
    if (
      !userSideWonTieBreakSet({
        teamNumber: userTeam.teamNumber,
        set: {
          teamAScore: row.teamAScore,
          teamBScore: row.teamBScore,
          isTieBreak: row.isTieBreak,
        },
      })
    ) {
      continue;
    }
    out.push({
      gameId: game.id,
      at: achievementPlayAt(game),
    });
  }
  out.sort((a, b) => {
    const t = a.at.getTime() - b.at.getTime();
    if (t !== 0) return t;
    return a.gameId.localeCompare(b.gameId);
  });
  return out;
}
