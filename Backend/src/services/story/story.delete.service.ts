import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { softDeleteStoryItemRow } from './story.item.service';

export class StoryDeleteService {
  static async deleteItem(userId: string, itemId: string): Promise<{ segmentKey: string }> {
    const item = await prisma.userStoryItem.findUnique({
      where: { id: itemId },
      include: { story: { select: { userId: true } } },
    });
    if (!item || item.deletedAt) {
      throw new ApiError(404, 'Story item not found');
    }
    if (item.story.userId !== userId) {
      throw new ApiError(403, 'You can only delete your own story items');
    }

    const segmentKey = await softDeleteStoryItemRow(item);
    return { segmentKey };
  }
}
