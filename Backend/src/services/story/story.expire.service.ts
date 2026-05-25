import prisma from '../../config/database';
import { ImageProcessor } from '../../utils/imageProcessor';
import { deleteEngagementForManualItem } from '../storyEngagement/storyEngagement.feedCounts';

export async function expireStories(): Promise<number> {
  const now = new Date();
  const expired = await prisma.userStory.findMany({
    where: { expiresAt: { lte: now } },
    include: {
      items: {
        select: {
          id: true,
          mediaUrl: true,
          thumbnailUrl: true,
          posterUrl: true,
        },
      },
    },
  });

  if (expired.length === 0) return 0;

  for (const story of expired) {
    for (const item of story.items) {
      await deleteEngagementForManualItem(item.id);
    }
  }

  const storyIds = expired.map((s) => s.id);
  await prisma.userStory.deleteMany({ where: { id: { in: storyIds } } });

  for (const story of expired) {
    for (const item of story.items) {
      await ImageProcessor.deleteFilePair(item.mediaUrl, item.thumbnailUrl);
      if (item.posterUrl && item.posterUrl !== item.thumbnailUrl) {
        await ImageProcessor.deleteFile(item.posterUrl);
      }
    }
  }

  return expired.length;
}
