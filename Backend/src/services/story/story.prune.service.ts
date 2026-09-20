import prisma from '../../config/database';
import {
  isStoryItemMediaInvalid,
  isStoryItemMediaMissingInStorage,
  type StoryMediaInput,
} from './story.validate.service';
import { softDeleteStoryItemRow } from './story.item.service';
import { recapRetentionCutoff } from '../recap/recapMonth';

const PRUNE_BATCH_SIZE = 200;

export type PruneInvalidStoryItemsResult = {
  itemsPruned: number;
  storiesRemoved: number;
};

export async function pruneInvalidStoryItems(options?: {
  ownerUserId?: string;
}): Promise<PruneInvalidStoryItemsResult> {
  const now = new Date();
  let itemsPruned = 0;
  let storiesRemoved = 0;
  let cursor: string | undefined;
  const ownerUserId = options?.ownerUserId;

  for (;;) {
    const items = await prisma.userStoryItem.findMany({
      where: {
        deletedAt: null,
        story: {
          expiresAt: { gt: now },
          ...(ownerUserId ? { userId: ownerUserId } : {}),
        },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      include: { story: { select: { userId: true } } },
      orderBy: { id: 'asc' },
      take: PRUNE_BATCH_SIZE,
    });

    if (items.length === 0) break;

    for (const item of items) {
      cursor = item.id;
      const media: StoryMediaInput = {
        mediaUrl: item.mediaUrl,
        thumbnailUrl: item.thumbnailUrl,
        posterUrl: item.posterUrl,
      };

      const invalid = isStoryItemMediaInvalid(media);
      const missing = invalid ? false : await isStoryItemMediaMissingInStorage(media);
      if (!invalid && !missing) continue;

      const activeBefore = await prisma.userStoryItem.count({
        where: { storyId: item.storyId, deletedAt: null },
      });

      await softDeleteStoryItemRow(item);
      itemsPruned += 1;
      if (activeBefore === 1) storiesRemoved += 1;
    }

    if (items.length < PRUNE_BATCH_SIZE) break;
  }

  return { itemsPruned, storiesRemoved };
}

/**
 * PRD 353 — `MonthlyRecap` rows are kept for 12 months.
 *
 * Batched on the ascending-id cursor like the story-item sweep above so a long
 * backlog never turns into one unbounded `deleteMany` holding a write lock.
 * The unique `(userId, monthKey)` is what makes regeneration idempotent, so
 * deleting an expired row can never resurrect a duplicate.
 */
export async function pruneExpiredMonthlyRecaps(
  now = new Date(),
): Promise<{ recapsPruned: number }> {
  const cutoff = recapRetentionCutoff(now);
  let recapsPruned = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.monthlyRecap.findMany({
      where: {
        createdAt: { lt: cutoff },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: PRUNE_BATCH_SIZE,
    });
    if (rows.length === 0) break;

    cursor = rows[rows.length - 1].id;
    const deleted = await prisma.monthlyRecap.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
    recapsPruned += deleted.count;

    if (rows.length < PRUNE_BATCH_SIZE) break;
  }

  return { recapsPruned };
}
