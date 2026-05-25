import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MAX_CAPTION_LENGTH, normalizeCaption } from './storyEngagement.constants';

export class StoryEngagementCaptionService {
  static async updateItemCaption(userId: string, itemId: string, caption?: string | null) {
    const now = new Date();
    const item = await prisma.userStoryItem.findFirst({
      where: {
        id: itemId,
        deletedAt: null,
        story: { userId, expiresAt: { gt: now } },
      },
      select: { id: true },
    });

    if (!item) {
      throw new ApiError(404, 'Story item not found');
    }

    const normalized = normalizeCaption(caption, MAX_CAPTION_LENGTH);
    const updated = await prisma.userStoryItem.update({
      where: { id: itemId },
      data: { caption: normalized },
      select: { id: true, caption: true },
    });

    return updated;
  }
}
