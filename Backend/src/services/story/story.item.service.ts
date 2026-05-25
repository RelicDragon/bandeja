import { StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { deleteStoryMedia } from './story.media';
import { emitStoryDeleted } from './story.events';

type StoryItemRow = {
  id: string;
  storyId: string;
  mediaUrl: string;
  thumbnailUrl: string;
  posterUrl: string | null;
  story: { userId: string };
};

export async function softDeleteStoryItemRow(item: StoryItemRow): Promise<string> {
  const segmentKey = `${StorySourceType.USER_STORY_ITEM}:${item.id}`;

  await prisma.userStoryItem.update({
    where: { id: item.id },
    data: { deletedAt: new Date() },
  });

  const remaining = await prisma.userStoryItem.count({
    where: { storyId: item.storyId, deletedAt: null },
  });

  if (remaining === 0) {
    await prisma.userStory.delete({ where: { id: item.storyId } });
    await deleteStoryMedia([item.mediaUrl, item.thumbnailUrl, item.posterUrl]);
  }

  await emitStoryDeleted(item.story.userId, segmentKey);
  return segmentKey;
}
