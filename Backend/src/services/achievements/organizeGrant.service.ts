import { EntityType, ParticipantRole, Prisma, type Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  filterOrganizeDefinitionsDue,
  gameQualifiesForOrganizeHabit,
  type OrganizeHabitKind,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import {
  type HabitGrantResult,
  type HabitUnlockMeta,
} from './habitGrant.service';
import { attachHabitUnlocksToGameOutcome } from './habitUnlockAttach.service';
import {
  readOrganizeAchievementStats,
  upsertOrganizeAchievementStats,
} from './achievementStats.service';

type DbClient = Prisma.TransactionClient | typeof prisma;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toUnlockMeta(
  definition: (typeof ACHIEVEMENT_CATALOG)[number],
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

export async function countOrganizedFinalEvents(params: {
  userId: string;
  kind: OrganizeHabitKind;
  excludeGameId?: string | null;
  tx?: DbClient;
}): Promise<number> {
  const db = params.tx ?? prisma;
  const base =
    params.kind === 'BAR'
      ? {
          entityType: EntityType.BAR,
        }
      : {
          entityType:
            params.kind === 'GAME' ? EntityType.GAME : EntityType.TOURNAMENT,
          sport: 'PADEL' as Sport,
          affectsRating: true,
        };

  return db.game.count({
    where: {
      ...base,
      resultsStatus: 'FINAL',
      ...(params.excludeGameId ? { id: { not: params.excludeGameId } } : {}),
      // Rated padel organize credit requires real results (blocks status-only FINAL abuse).
      ...(params.kind === 'BAR' ? {} : { outcomes: { some: {} } }),
      participants: {
        some: { userId: params.userId, role: ParticipantRole.OWNER },
      },
    },
  });
}

export async function loadOrganizeHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<{
  organizedGames: number;
  organizedTournaments: number;
  organizedBars: number;
}> {
  const cached = await readOrganizeAchievementStats(userId, tx);
  if (cached) return cached;
  return refreshOrganizeHabitCounters(userId, tx);
}

export async function refreshOrganizeHabitCounters(
  userId: string,
  tx?: DbClient,
): Promise<{
  organizedGames: number;
  organizedTournaments: number;
  organizedBars: number;
}> {
  const [organizedGames, organizedTournaments, organizedBars] = await Promise.all([
    countOrganizedFinalEvents({ userId, kind: 'GAME', tx }),
    countOrganizedFinalEvents({ userId, kind: 'TOURNAMENT', tx }),
    countOrganizedFinalEvents({ userId, kind: 'BAR', tx }),
  ]);
  const organize = { organizedGames, organizedTournaments, organizedBars };
  await upsertOrganizeAchievementStats({ userId, organize, tx });
  return organize;
}

/**
 * Grant organizer habits when a qualifying event becomes FINAL.
 * Forward-only on this event (before = count excluding game, after = including).
 * One-shot habits are never revoked on leave-FINAL (unlike podium).
 */
export async function grantOrganizeAchievementsForFinalizedGame(params: {
  gameId: string;
  tx?: DbClient;
}): Promise<HabitGrantResult> {
  const db = params.tx ?? prisma;
  const game = await db.game.findUnique({
    where: { id: params.gameId },
    select: {
      id: true,
      entityType: true,
      sport: true,
      affectsRating: true,
      resultsStatus: true,
      participants: {
        where: { role: ParticipantRole.OWNER },
        select: { userId: true },
        take: 1,
      },
      _count: { select: { outcomes: true } },
    },
  });

  if (!game || game.resultsStatus !== 'FINAL') {
    return { granted: [], unlocks: [] };
  }

  // GAME/TOURNAMENT: require outcomes so patch-FINAL without results cannot climb the ladder.
  if (game.entityType !== EntityType.BAR && game._count.outcomes === 0) {
    return { granted: [], unlocks: [] };
  }

  const ownerId = game.participants[0]?.userId;
  if (!ownerId) return { granted: [], unlocks: [] };

  let kind: OrganizeHabitKind | null = null;
  if (
    gameQualifiesForOrganizeHabit({
      entityType: game.entityType,
      sport: game.sport,
      affectsRating: game.affectsRating,
      kind: 'GAME',
    })
  ) {
    kind = 'GAME';
  } else if (
    gameQualifiesForOrganizeHabit({
      entityType: game.entityType,
      sport: game.sport,
      affectsRating: game.affectsRating,
      kind: 'TOURNAMENT',
    })
  ) {
    kind = 'TOURNAMENT';
  } else if (
    gameQualifiesForOrganizeHabit({
      entityType: game.entityType,
      sport: game.sport,
      affectsRating: game.affectsRating,
      kind: 'BAR',
    })
  ) {
    kind = 'BAR';
  }
  if (!kind) return { granted: [], unlocks: [] };

  const before = await countOrganizedFinalEvents({
    userId: ownerId,
    kind,
    excludeGameId: game.id,
    tx: db,
  });
  const after = before + 1;

  const existing = await db.userAchievement.findMany({
    where: { userId: ownerId },
    select: { definitionId: true },
  });
  const ownedDefinitionIds = new Set(existing.map((r) => r.definitionId));
  const due = filterOrganizeDefinitionsDue({
    definitions: ACHIEVEMENT_CATALOG,
    kind,
    before,
    after,
    ownedDefinitionIds,
  });

  const granted: HabitGrantResult['granted'] = [];
  const unlocks: HabitUnlockMeta[] = [];
  const sport = kind === 'BAR' ? null : game.sport;

  for (const definition of due) {
    try {
      const row = await db.userAchievement.create({
        data: {
          userId: ownerId,
          definitionId: definition.id,
          sourceKey: '',
          sport,
          sourceGameId: game.id,
          sourceEntityType: game.entityType,
          sourceEntityId: game.id,
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

  if (unlocks.length > 0) {
    await attachHabitUnlocksToGameOutcome({
      db,
      gameId: game.id,
      userId: ownerId,
      unlocks,
    });
  }

  const organize = {
    organizedGames: await countOrganizedFinalEvents({ userId: ownerId, kind: 'GAME', tx: db }),
    organizedTournaments: await countOrganizedFinalEvents({
      userId: ownerId,
      kind: 'TOURNAMENT',
      tx: db,
    }),
    organizedBars: await countOrganizedFinalEvents({ userId: ownerId, kind: 'BAR', tx: db }),
  };
  await upsertOrganizeAchievementStats({ userId: ownerId, organize, tx: db });

  return { granted, unlocks };
}
