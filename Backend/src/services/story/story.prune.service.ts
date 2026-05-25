import prisma from '../../config/database';
import {
  isStoryItemMediaInvalid,
  isStoryItemMediaMissingInStorage,
  type StoryMediaInput,
} from './story.validate.service';
import { softDeleteStoryItemRow } from './story.item.service';

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
