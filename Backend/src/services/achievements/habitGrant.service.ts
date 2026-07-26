import { Prisma, type Sport } from '@prisma/client';
import {
  habitUnlocksNewlyCrossed,
  type AchievementDefinition,
  type HabitProgressCounters,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { countersFromSportProfiles } from './achievementProjection.service';

export const HABIT_UNLOCKS_KEY = 'habitUnlocks';

export type HabitUnlockMeta = {
  definitionId: string;
  rarity: string;
  artKey: string;
  titleKey: string;
  achievementId?: string;
};

export type HabitGrantResult = {
  granted: AchievementDefinition[];
  unlocks: HabitUnlockMeta[];
};

function toUnlockMeta(
  definition: AchievementDefinition,
  achievementId?: string,
): HabitUnlockMeta {
  return {
    definitionId: definition.id,
    rarity: definition.rarity,
    artKey: definition.artKey,
    titleKey: definition.titleKey,
    ...(achievementId ? { achievementId } : {}),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function mergeHabitUnlocksMetadata(
  existing: Prisma.JsonValue | Prisma.InputJsonValue | null | undefined,
  unlocks: HabitUnlockMeta[],
): Prisma.InputJsonValue {
  const base: Record<string, unknown> =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (unlocks.length > 0) {
    base[HABIT_UNLOCKS_KEY] = unlocks;
  }
  return base as Prisma.InputJsonValue;
}

export function readHabitUnlocksFromMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): HabitUnlockMeta[] {
  if (metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }
  const raw = (metadata as Record<string, unknown>)[HABIT_UNLOCKS_KEY];
  if (!Array.isArray(raw)) return [];
  const out: HabitUnlockMeta[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (
      typeof row.definitionId !== 'string' ||
      typeof row.rarity !== 'string' ||
      typeof row.artKey !== 'string' ||
      typeof row.titleKey !== 'string'
    ) {
      continue;
    }
    out.push({
      definitionId: row.definitionId,
      rarity: row.rarity,
      artKey: row.artKey,
      titleKey: row.titleKey,
      ...(typeof row.achievementId === 'string' ? { achievementId: row.achievementId } : {}),
    });
  }
  return out;
}

type SportHabitOverride = {
  gamesPlayed: number;
  gamesWon: number;
  playStreakBest: number;
  playStreakCount: number;
};

/** Before/after habit counters for one sport update (other sports unchanged). */
export async function habitCounterPairForSportUpdate(params: {
  userId: string;
  sport: Sport;
  before: SportHabitOverride;
  after: SportHabitOverride;
  tx?: Prisma.TransactionClient | typeof prisma;
}): Promise<{ before: HabitProgressCounters; after: HabitProgressCounters }> {
  const db = params.tx ?? prisma;
  const others = await db.userSportProfile.findMany({
    where: { userId: params.userId, sport: { not: params.sport } },
    select: {
      gamesPlayed: true,
      gamesWon: true,
      playStreakBest: true,
      playStreakCount: true,
    },
  });
  return {
    before: countersFromSportProfiles([...others, params.before]),
    after: countersFromSportProfiles([...others, params.after]),
  };
}

/**
 * Grant one-shot habit trophies newly crossed on this event.
 * Idempotent: any prior row for the definition (active or not) blocks re-grant;
 * partial unique on active rows still guards concurrent creates.
 * Forward-only: requires before→after threshold crossing (no historical soft backfill).
 */
export async function grantHabitAchievements(params: {
  userId: string;
  before: HabitProgressCounters;
  after: HabitProgressCounters;
  sport?: Sport | null;
  sourceGameId?: string | null;
  tx?: Prisma.TransactionClient | typeof prisma;
}): Promise<HabitGrantResult> {
  const db = params.tx ?? prisma;

  // One-shot: any historical instance (including revoked) means already granted.
  const existing = await db.userAchievement.findMany({
    where: { userId: params.userId },
    select: { definitionId: true },
  });
  const ownedDefinitionIds = new Set(existing.map((r) => r.definitionId));
  const due = habitUnlocksNewlyCrossed({
    before: params.before,
    after: params.after,
    ownedDefinitionIds,
  });
  if (due.length === 0) {
    return { granted: [], unlocks: [] };
  }

  const granted: AchievementDefinition[] = [];
  const unlocks: HabitUnlockMeta[] = [];
  for (const definition of due) {
    try {
      const row = await db.userAchievement.create({
        data: {
          userId: params.userId,
          definitionId: definition.id,
          sourceKey: '',
          sport: params.sport ?? null,
          sourceGameId: params.sourceGameId ?? null,
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

  return { granted, unlocks };
}
