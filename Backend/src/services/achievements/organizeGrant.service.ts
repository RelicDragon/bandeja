import { EntityType, ParticipantRole, Prisma, type Sport } from '@prisma/client';
import {
  ACHIEVEMENT_CATALOG,
  filterOrganizeDefinitionsDue,
  gameQualifiesForOrganizeHabit,
  type OrganizeHabitKind,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import {
  mergeHabitUnlocksMetadata,
  type HabitGrantResult,
  type HabitUnlockMeta,
} from './habitGrant.service';

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
  const [organizedGames, organizedTournaments, organizedBars] = await Promise.all([
    countOrganizedFinalEvents({ userId, kind: 'GAME', tx }),
    countOrganizedFinalEvents({ userId, kind: 'TOURNAMENT', tx }),
    countOrganizedFinalEvents({ userId, kind: 'BAR', tx }),
  ]);
  return { organizedGames, organizedTournaments, organizedBars };
}

/**
 * Grant organizer habits when a qualifying event becomes FINAL.
 * Forward-only on this event (before = count excluding game, after = including).
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
    },
  });

  if (!game || game.resultsStatus !== 'FINAL') {
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
  if (due.length === 0) return { granted: [], unlocks: [] };

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
    const outcome = await db.gameOutcome.findUnique({
      where: { gameId_userId: { gameId: game.id, userId: ownerId } },
      select: { id: true, metadata: true },
    });
    if (outcome) {
      await db.gameOutcome.update({
        where: { id: outcome.id },
        data: {
          metadata: mergeHabitUnlocksMetadata(outcome.metadata, unlocks),
        },
      });
    }
  }

  return { granted, unlocks };
}
