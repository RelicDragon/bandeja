import { EntityType, ParticipantRole, StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ParticipantService } from '../game/participant.service';
import { emitStoryDeleted } from './story.events';
import { softDeleteStoryItemRow } from './story.item.service';
import { segmentKey } from './story.feed.service';

const PROJECTED_SOURCE_TYPES = new Set<StorySourceType>([
  StorySourceType.GAME_PHOTO,
  StorySourceType.GAME_CREATED,
  StorySourceType.GAME_RESULT,
  StorySourceType.BRACKET_CHAMPION,
]);

export class StoryDeleteService {
  static async deleteItem(userId: string, itemId: string): Promise<{ segmentKey: string }> {
    return this.deleteSegment(userId, StorySourceType.USER_STORY_ITEM, itemId);
  }

  static async deleteSegment(
    userId: string,
    sourceType: StorySourceType | string,
    sourceId: string
  ): Promise<{ segmentKey: string }> {
    const normalizedType = sourceType as StorySourceType;
    if (!Object.values(StorySourceType).includes(normalizedType)) {
      throw new ApiError(400, 'Invalid sourceType');
    }
    const trimmedId = sourceId?.trim();
    if (!trimmedId) {
      throw new ApiError(400, 'sourceId is required');
    }

    if (normalizedType === StorySourceType.USER_STORY_ITEM) {
      const item = await prisma.userStoryItem.findUnique({
        where: { id: trimmedId },
        include: { story: { select: { userId: true } } },
      });
      if (!item) {
        throw new ApiError(404, 'Story item not found');
      }
      if (item.story.userId !== userId) {
        throw new ApiError(403, 'You can only delete your own story items');
      }
      if (item.deletedAt) {
        return { segmentKey: segmentKey(StorySourceType.USER_STORY_ITEM, item.id) };
      }
      const key = await softDeleteStoryItemRow(item);
      return { segmentKey: key };
    }

    if (!PROJECTED_SOURCE_TYPES.has(normalizedType)) {
      throw new ApiError(400, 'Unsupported sourceType');
    }

    await assertOwnsProjectedSegment(userId, normalizedType, trimmedId);
    const key = segmentKey(normalizedType, trimmedId);

    // Result stories on plain games: flip the results switch (no champion side effects).
    // Season-linked results: dismiss only so bracket champion slides stay.
    if (normalizedType === StorySourceType.GAME_RESULT) {
      const game = await prisma.game.findUnique({
        where: { id: trimmedId },
        select: {
          entityType: true,
          parent: { select: { entityType: true } },
        },
      });
      const seasonLinked =
        game?.entityType === EntityType.LEAGUE_SEASON ||
        game?.parent?.entityType === EntityType.LEAGUE_SEASON;

      if (!seasonLinked) {
        await ParticipantService.setShowInStories(trimmedId, userId, false);
      }
    }

    await prisma.storySegmentDismissal.upsert({
      where: {
        userId_sourceType_sourceId: {
          userId,
          sourceType: normalizedType,
          sourceId: trimmedId,
        },
      },
      create: { userId, sourceType: normalizedType, sourceId: trimmedId },
      update: {},
    });

    await emitStoryDeleted(userId, key);
    return { segmentKey: key };
  }
}

async function assertOwnsProjectedSegment(
  userId: string,
  sourceType: StorySourceType,
  sourceId: string
): Promise<void> {
  switch (sourceType) {
    case StorySourceType.GAME_PHOTO: {
      const photo = await prisma.gamePhoto.findFirst({
        where: { id: sourceId, deletedAt: null },
        select: { uploaderId: true },
      });
      if (!photo) throw new ApiError(404, 'Story not found');
      if (photo.uploaderId !== userId) {
        throw new ApiError(403, 'You can only delete your own stories');
      }
      return;
    }
    case StorySourceType.GAME_CREATED: {
      const participant = await prisma.gameParticipant.findUnique({
        where: { userId_gameId: { userId, gameId: sourceId } },
        select: { role: true },
      });
      if (!participant || participant.role !== ParticipantRole.OWNER) {
        throw new ApiError(403, 'You can only delete your own stories');
      }
      return;
    }
    case StorySourceType.GAME_RESULT: {
      const participant = await prisma.gameParticipant.findUnique({
        where: { userId_gameId: { userId, gameId: sourceId } },
        select: { userId: true },
      });
      if (participant) return;

      const outcome = await prisma.gameOutcome.findFirst({
        where: { gameId: sourceId, userId },
        select: { id: true },
      });
      if (!outcome) throw new ApiError(404, 'Story not found');
      return;
    }
    case StorySourceType.BRACKET_CHAMPION: {
      return;
    }
    default:
      throw new ApiError(400, 'Unsupported sourceType');
  }
}
