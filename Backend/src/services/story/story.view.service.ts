import { StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { emitStoryViewed } from './story.events';

export type StoryViewEntry = {
  sourceType: StorySourceType;
  sourceId: string;
  ownerUserId: string;
};

export class StoryViewService {
  static async markViewed(viewerId: string, entries: StoryViewEntry[]): Promise<{ upserted: number }> {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new ApiError(400, 'entries must be a non-empty array');
    }

    let upserted = 0;
    for (const entry of entries) {
      if (!entry.sourceType || !entry.sourceId || !entry.ownerUserId) {
        throw new ApiError(400, 'Each entry requires sourceType, sourceId, and ownerUserId');
      }
      if (!Object.values(StorySourceType).includes(entry.sourceType)) {
        throw new ApiError(400, 'Invalid sourceType');
      }

      await prisma.storyView.upsert({
        where: {
          viewerId_sourceType_sourceId: {
            viewerId,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId,
          },
        },
        create: {
          viewerId,
          ownerUserId: entry.ownerUserId,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
        },
        update: { viewedAt: new Date() },
      });
      upserted += 1;

      const segmentKey = `${entry.sourceType}:${entry.sourceId}`;
      emitStoryViewed(entry.ownerUserId, segmentKey, viewerId);
    }

    return { upserted };
  }
}
