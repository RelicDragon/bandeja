import { EntityType, Prisma, type Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  filterThresholdDefinitionsDue,
  partnerCountersBeforeAfter,
  type AchievementDefinition,
  type PartnerHabitCounters,
  type PartnerPlayerSnap,
  type PartnerScannedMatch,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import {
  AchievementStatsRefreshError,
  beginAchievementStatsRefresh,
  commitPartnerAchievementStatsIfUnchanged,
  lockAchievementStatsWrite,
  readPartnerAchievementStats,
  upsertPartnerAchievementStats,
} from './achievementStats.service';
import { achievementPlayAt } from './achievementPlayAt';
import { attachHabitUnlocksToGameOutcome } from './habitUnlockAttach.service';
import type { HabitGrantResult, HabitUnlockMeta } from './habitGrant.service';

type DbClient = Prisma.TransactionClient | typeof prisma;

type ScannedGame = {
  id: string;
  entityType: EntityType;
  sport: Sport;
  finishedAt: Date;
  players: PartnerPlayerSnap[];
  matches: Array<
    PartnerScannedMatch & {
      sets: Array<{ teamAScore: number; teamBScore: number; isTieBreak: boolean }>;
    }
  >;
};

export type { PartnerHabitCounters };

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

/**
 * Giant Killer uses GameOutcome levelBefore / reliabilityBefore (event start).
 * Deterministic across multi-match events — avoids live profile gamesPlayed drift.
 */
function toScanInput(games: ScannedGame[]) {
  return games.map((game) => ({
    id: game.id,
    players: game.players,
    matches: game.matches.map((m) => ({
      winnerId: m.winnerId,
      teams: m.teams,
      played: m.sets.some((s) => s.teamAScore > 0 || s.teamBScore > 0),
    })),
  }));
}

async function loadScannedGamesForUser(params: {
  userId: string;
  tx?: DbClient;
}): Promise<ScannedGame[]> {
  const db = params.tx ?? prisma;
  const games = await db.game.findMany({
    where: {
      sport: 'PADEL',
      affectsRating: true,
      resultsStatus: 'FINAL',
      entityType: { in: [EntityType.GAME, EntityType.TOURNAMENT, EntityType.LEAGUE] },
      rounds: {
        some: {
          matches: {
            some: {
              teams: { some: { players: { some: { userId: params.userId } } } },
            },
          },
        },
      },
    },
    // Order in JS by playAt — finishedDate ASC puts null finishedDate last while
    // playAt falls back to earlier endTime/startTime (inverts crossing dates).
    select: {
      id: true,
      entityType: true,
      sport: true,
      finishedDate: true,
      endTime: true,
      startTime: true,
      createdAt: true,
      outcomes: {
        select: {
          userId: true,
          levelBefore: true,
          reliabilityBefore: true,
        },
      },
      rounds: {
        orderBy: { roundNumber: 'asc' },
        select: {
          matches: {
            orderBy: { matchNumber: 'asc' },
            select: {
              winnerId: true,
              teams: {
                select: {
                  id: true,
                  teamNumber: true,
                  players: { select: { userId: true } },
                },
              },
              sets: {
                orderBy: { setNumber: 'asc' },
                select: { teamAScore: true, teamBScore: true, isTieBreak: true },
              },
            },
          },
        },
      },
    },
  });

  const scanned = games.map((game) => {
    const outcomeByUser = new Map(game.outcomes.map((o) => [o.userId, o]));
    const playerIds = new Set<string>();
    for (const round of game.rounds) {
      for (const match of round.matches) {
        for (const team of match.teams) {
          for (const p of team.players) playerIds.add(p.userId);
        }
      }
    }

    const players: PartnerPlayerSnap[] = [...playerIds].map((userId) => {
      const outcome = outcomeByUser.get(userId);
      return {
        userId,
        level: outcome?.levelBefore ?? 1,
        reliability: outcome?.reliabilityBefore ?? 0,
      };
    });

    const matches = [];
    for (const round of game.rounds) {
      for (const match of round.matches) {
        matches.push({
          winnerId: match.winnerId,
          teams: match.teams.map((t) => ({
            id: t.id,
            teamNumber: t.teamNumber,
            playerIds: t.players.map((p) => p.userId),
          })),
          sets: match.sets.map((s) => ({
            teamAScore: s.teamAScore,
            teamBScore: s.teamBScore,
            isTieBreak: s.isTieBreak,
          })),
        });
      }
    }

    return {
      id: game.id,
      entityType: game.entityType,
      sport: game.sport,
      finishedAt: achievementPlayAt(game),
      players,
      matches,
    };
  });

  scanned.sort((a, b) => {
    const t = a.finishedAt.getTime() - b.finishedAt.getTime();
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
  return scanned;
}

/** Chronological partner-eligible games for backfill crossing dates. */
export async function loadPartnerGamesChronological(
  userId: string,
  tx?: DbClient,
): Promise<
  Array<{
    id: string;
    finishedAt: Date;
    players: PartnerPlayerSnap[];
    matches: Array<{
      winnerId: string | null;
      teams: Array<{ id: string; teamNumber: number; playerIds: string[] }>;
      played: boolean;
    }>;
  }>
> {
  const games = await loadScannedGamesForUser({ userId, tx });
  return toScanInput(games).map((g, i) => ({
    ...g,
    finishedAt: games[i]!.finishedAt,
  }));
}

export async function computePartnerHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<PartnerHabitCounters> {
  const games = await loadScannedGamesForUser({ userId, tx });
  const { after } = partnerCountersBeforeAfter({
    games: toScanInput(games),
    userId,
    excludeGameId: '__none__',
  });
  return after;
}

export async function loadPartnerHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<PartnerHabitCounters> {
  const cached = await readPartnerAchievementStats(userId, tx);
  if (cached) return cached;
  return refreshPartnerHabitCounters(userId, tx);
}

export async function refreshPartnerHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<PartnerHabitCounters> {
  const startedRevision = await beginAchievementStatsRefresh(userId, tx);
  try {
    const computed = await computePartnerHabitCounters(userId, tx);
    await commitPartnerAchievementStatsIfUnchanged({
      userId,
      startedRevision,
      partner: computed,
      tx,
    });
    return computed;
  } catch (error) {
    throw new AchievementStatsRefreshError(startedRevision, error);
  }
}

async function grantDueForUser(params: {
  db: DbClient;
  userId: string;
  gameId: string;
  sport: Sport;
  entityType: EntityType;
  before: PartnerHabitCounters;
  after: PartnerHabitCounters;
}): Promise<HabitGrantResult> {
  const existing = await params.db.userAchievement.findMany({
    where: { userId: params.userId },
    select: { definitionId: true },
  });
  const ownedDefinitionIds = new Set(existing.map((r) => r.definitionId));

  const due = [
    ...filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_GIANT_KILLER',
      before: params.before.giantKillerWins,
      after: params.after.giantKillerWins,
      ownedDefinitionIds,
    }),
    ...filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_DYNAMIC_DUO',
      before: params.before.dynamicDuoMaxWins,
      after: params.after.dynamicDuoMaxWins,
      ownedDefinitionIds,
    }),
    ...filterThresholdDefinitionsDue({
      definitions: ACHIEVEMENT_CATALOG,
      ruleKind: 'HABIT_OPEN_COURT',
      before: params.before.openCourtPartners,
      after: params.after.openCourtPartners,
      ownedDefinitionIds,
    }),
  ];
  if (due.length === 0) return { granted: [], unlocks: [] };

  const granted: AchievementDefinition[] = [];
  const unlocks: HabitUnlockMeta[] = [];

  for (const definition of due) {
    try {
      const row = await params.db.userAchievement.create({
        data: {
          userId: params.userId,
          definitionId: definition.id,
          sourceKey: '',
          sport: params.sport,
          sourceGameId: params.gameId,
          sourceEntityType: params.entityType,
          sourceEntityId: params.gameId,
          isActive: true,
        },
      });
      granted.push(definition);
      unlocks.push(toUnlockMeta(definition, row.id));
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }

  await attachHabitUnlocksToGameOutcome({
    db: params.db,
    gameId: params.gameId,
    userId: params.userId,
    unlocks,
  });

  return { granted, unlocks };
}

/**
 * Grant Giant Killer / Dynamic Duo / Open Court when a rated padel event becomes FINAL.
 * One history load per participant; before/after computed in memory.
 * One-shot habits are never revoked on leave-FINAL or result edits (unlike podium).
 */
export async function grantPartnerAchievementsForFinalizedGame(params: {
  gameId: string;
  tx?: Prisma.TransactionClient;
}): Promise<HabitGrantResult> {
  if (!params.tx) {
    return prisma.$transaction((tx) =>
      grantPartnerAchievementsForFinalizedGame({
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
      affectsRating: true,
      resultsStatus: true,
      entityType: true,
    },
  });

  if (
    !game ||
    game.resultsStatus !== 'FINAL' ||
    game.sport !== 'PADEL' ||
    !game.affectsRating ||
    (game.entityType !== EntityType.GAME &&
      game.entityType !== EntityType.TOURNAMENT &&
      game.entityType !== EntityType.LEAGUE)
  ) {
    return { granted: [], unlocks: [] };
  }

  const participantIds = await db.teamPlayer.findMany({
    where: {
      team: {
        match: {
          round: { gameId: game.id },
        },
      },
    },
    select: { userId: true },
    distinct: ['userId'],
  });
  if (participantIds.length === 0) return { granted: [], unlocks: [] };

  const allGranted: AchievementDefinition[] = [];
  const allUnlocks: HabitUnlockMeta[] = [];

  const sortedParticipantIds = participantIds
    .map(({ userId }) => userId)
    .sort((left, right) => left.localeCompare(right));

  for (const userId of sortedParticipantIds) {
    await lockAchievementStatsWrite({
      userId,
      kind: 'partner',
      tx: db,
    });
    const games = await loadScannedGamesForUser({ userId, tx: db });
    const { before, after } = partnerCountersBeforeAfter({
      games: toScanInput(games),
      userId,
      excludeGameId: game.id,
    });

    await upsertPartnerAchievementStats({ userId, partner: after, tx: db });

    if (
      before.giantKillerWins === after.giantKillerWins &&
      before.dynamicDuoMaxWins === after.dynamicDuoMaxWins &&
      before.openCourtPartners === after.openCourtPartners
    ) {
      continue;
    }

    const result = await grantDueForUser({
      db,
      userId,
      gameId: game.id,
      sport: game.sport,
      entityType: game.entityType,
      before,
      after,
    });
    allGranted.push(...result.granted);
    allUnlocks.push(...result.unlocks);
  }

  return { granted: allGranted, unlocks: allUnlocks };
}
