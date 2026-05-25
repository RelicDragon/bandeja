import { ACTIVITY_WINDOW_MS } from '../../src/services/story/story.constants';
import prisma from '../../src/config/database';

export async function pruneStoryEngagement(): Promise<{ likes: number; comments: number }> {
  const cutoff = new Date(Date.now() - ACTIVITY_WINDOW_MS - 24 * 60 * 60 * 1000);
  const activityTypes = ['GAME_PHOTO', 'GAME_CREATED', 'GAME_RESULT'] as const;

  const [likes, comments] = await Promise.all([
    prisma.storySegmentLike.deleteMany({
      where: {
        sourceType: { in: [...activityTypes] },
        createdAt: { lt: cutoff },
      },
    }),
    prisma.storySegmentComment.deleteMany({
      where: {
        sourceType: { in: [...activityTypes] },
        createdAt: { lt: cutoff },
      },
    }),
  ]);

  return { likes: likes.count, comments: comments.count };
}

if (require.main === module) {
  pruneStoryEngagement()
    .then((result) => {
      console.log(`Pruned story engagement: ${result.likes} likes, ${result.comments} comments`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
