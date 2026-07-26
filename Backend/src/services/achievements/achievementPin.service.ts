import type { Prisma } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import {
  SHOWCASE_SLOT_COUNT,
  decidePinSlot,
  getAchievementDefinition,
  isValidShowcaseSlot,
} from '@bandeja/shared/achievements';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';

type DbClient = Prisma.TransactionClient | typeof prisma;

type PinWithAchievement = {
  slot: number;
  achievementId: string;
  achievement: { id: string; isActive: boolean; definitionId: string } | null;
};

function isActiveKnownPin(pin: PinWithAchievement): boolean {
  if (!pin.achievement?.isActive) return false;
  return Boolean(getAchievementDefinition(pin.achievement.definitionId));
}

/**
 * Load pins and delete orphans (inactive / unknown definition) so they never
 * block capacity while being invisible in the projection.
 */
async function loadActivePinsForUser(
  db: DbClient,
  userId: string,
): Promise<Array<{ slot: number; achievementId: string }>> {
  const pins = (await db.userAchievementPin.findMany({
    where: { userId },
    orderBy: { slot: 'asc' },
    include: {
      achievement: {
        select: { id: true, isActive: true, definitionId: true },
      },
    },
  })) as PinWithAchievement[];

  const orphanIds = pins.filter((p) => !isActiveKnownPin(p)).map((p) => p.achievementId);
  if (orphanIds.length > 0) {
    await db.userAchievementPin.deleteMany({
      where: { userId, achievementId: { in: orphanIds } },
    });
  }

  return pins
    .filter((p) => isActiveKnownPin(p))
    .map((p) => ({ slot: p.slot, achievementId: p.achievementId }));
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof PrismaNS.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/**
 * Pin an achievement instance into the owner's showcase.
 * Uses first free slot 0–2. When full, returns 409 (unpin first).
 */
export async function pinAchievementInstance(params: {
  userId: string;
  achievementId: string;
  /** Optional preferred slot; ignored if already pinned or out of range / occupied. */
  preferredSlot?: number;
  tx?: DbClient;
}): Promise<{ slot: number; achievementId: string; alreadyPinned: boolean }> {
  const run = async (db: DbClient) => {
    const achievement = await db.userAchievement.findFirst({
      where: {
        id: params.achievementId,
        userId: params.userId,
        isActive: true,
      },
      select: { id: true, definitionId: true },
    });
    if (!achievement || !getAchievementDefinition(achievement.definitionId)) {
      throw new ApiError(404, 'Achievement not found', true, { code: 'trophy.notFound' });
    }

    const existingPins = await loadActivePinsForUser(db, params.userId);

    const decision = decidePinSlot({
      existingPins,
      achievementId: params.achievementId,
    });

    if (decision.type === 'already') {
      return {
        slot: decision.slot,
        achievementId: params.achievementId,
        alreadyPinned: true,
      };
    }

    if (decision.type === 'full') {
      throw new ApiError(409, 'Showcase pins are full', true, {
        code: 'trophy.pinsFull',
        max: SHOWCASE_SLOT_COUNT,
      });
    }

    let slot = decision.slot;
    if (
      params.preferredSlot != null &&
      isValidShowcaseSlot(params.preferredSlot) &&
      !existingPins.some((p) => p.slot === params.preferredSlot)
    ) {
      slot = params.preferredSlot;
    }

    try {
      await db.userAchievementPin.create({
        data: {
          userId: params.userId,
          slot,
          achievementId: params.achievementId,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Concurrent pin race or already pinned — re-read and map cleanly.
        const again = await loadActivePinsForUser(db, params.userId);
        const existing = again.find((p) => p.achievementId === params.achievementId);
        if (existing) {
          return {
            slot: existing.slot,
            achievementId: params.achievementId,
            alreadyPinned: true,
          };
        }
        throw new ApiError(409, 'Showcase pins are full', true, {
          code: 'trophy.pinsFull',
          max: SHOWCASE_SLOT_COUNT,
        });
      }
      throw err;
    }

    return { slot, achievementId: params.achievementId, alreadyPinned: false };
  };

  if (params.tx) return run(params.tx);
  return prisma.$transaction((tx) => run(tx));
}

/**
 * Remove a pin for an owned achievement instance. No-op if not pinned.
 */
export async function unpinAchievementInstance(params: {
  userId: string;
  achievementId: string;
  tx?: DbClient;
}): Promise<{ removed: boolean; achievementId: string }> {
  const run = async (db: DbClient) => {
    const existing = await db.userAchievementPin.findFirst({
      where: {
        userId: params.userId,
        achievementId: params.achievementId,
      },
      select: { slot: true },
    });
    if (!existing) {
      return { removed: false, achievementId: params.achievementId };
    }

    await db.userAchievementPin.delete({
      where: {
        userId_slot: { userId: params.userId, slot: existing.slot },
      },
    });

    return { removed: true, achievementId: params.achievementId };
  };

  if (params.tx) return run(params.tx);
  return prisma.$transaction((tx) => run(tx));
}

/** Clear pins that point at revoked / inactive achievement ids (owner showcase hygiene). */
export async function clearPinsForAchievementIds(params: {
  userId?: string;
  achievementIds: string[];
  tx?: DbClient;
}): Promise<number> {
  if (params.achievementIds.length === 0) return 0;
  const db = params.tx ?? prisma;
  const result = await db.userAchievementPin.deleteMany({
    where: {
      achievementId: { in: params.achievementIds },
      ...(params.userId ? { userId: params.userId } : {}),
    },
  });
  return result.count;
}

/**
 * Projection-time orphan cleanup: drop pins whose achievement is inactive
 * or no longer in the catalog so showcase capacity stays truthful.
 */
export async function purgeOrphanPinsForUser(params: {
  userId: string;
  tx?: DbClient;
}): Promise<number> {
  const db = params.tx ?? prisma;
  const pins = await db.userAchievementPin.findMany({
    where: { userId: params.userId },
    include: {
      achievement: { select: { isActive: true, definitionId: true } },
    },
  });
  const orphanIds = pins
    .filter((p) => {
      if (!p.achievement?.isActive) return true;
      return !getAchievementDefinition(p.achievement.definitionId);
    })
    .map((p) => p.achievementId);
  if (orphanIds.length === 0) return 0;
  const result = await db.userAchievementPin.deleteMany({
    where: { userId: params.userId, achievementId: { in: orphanIds } },
  });
  return result.count;
}

export { SHOWCASE_SLOT_COUNT, decidePinSlot, isValidShowcaseSlot };
