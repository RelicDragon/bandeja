import { MessageType, Prisma, StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  MAX_OVERLAY_TEXT_LENGTH,
  MAX_VIDEO_DURATION_MS,
  STORY_TTL_MS,
} from './story.constants';
import {
  MAX_CAPTION_LENGTH,
  normalizeCaption,
} from '../storyEngagement/storyEngagement.constants';
import { emitStoryNew } from './story.events';
import { formatManualSegment, type StorySegment } from './story.feed.service';
import { validateStoryItemMediaInput } from './story.validate.service';

export type CreateStoryItemInput = {
  mediaUrl: string;
  thumbnailUrl: string;
  posterUrl?: string | null;
  messageType: MessageType;
  videoDurationMs?: number | null;
  width?: number | null;
  height?: number | null;
  overlayText?: string | null;
  overlayStyle?: unknown;
  caption?: string | null;
  clientUploadId?: string | null;
};

export class StoryCreateService {
  static async createItem(userId: string, input: CreateStoryItemInput): Promise<StorySegment> {
    if (input.messageType !== MessageType.IMAGE && input.messageType !== MessageType.VIDEO) {
      throw new ApiError(400, 'Story items must be IMAGE or VIDEO');
    }
    if (input.overlayText && input.overlayText.length > MAX_OVERLAY_TEXT_LENGTH) {
      throw new ApiError(400, `Overlay text must be ${MAX_OVERLAY_TEXT_LENGTH} characters or less`);
    }
    const normalizedCaption = normalizeCaption(input.caption, MAX_CAPTION_LENGTH);
    if (input.caption != null && input.caption.trim().length > MAX_CAPTION_LENGTH) {
      throw new ApiError(400, `Caption must be ${MAX_CAPTION_LENGTH} characters or less`);
    }
    if (
      input.messageType === MessageType.VIDEO &&
      input.videoDurationMs != null &&
      input.videoDurationMs > MAX_VIDEO_DURATION_MS
    ) {
      throw new ApiError(400, 'Video must be 60 seconds or less');
    }

    await validateStoryItemMediaInput({
      mediaUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl,
      posterUrl: input.posterUrl,
    });

    const normalizedClientUploadId = input.clientUploadId?.trim() || null;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STORY_TTL_MS);

    if (normalizedClientUploadId) {
      const existing = await prisma.userStoryItem.findFirst({
        where: {
          clientUploadId: normalizedClientUploadId,
          deletedAt: null,
          story: { userId, expiresAt: { gt: now } },
        },
      });
      if (existing) {
        return formatManualSegment(existing);
      }
    }

    try {
      const item = await prisma.$transaction(async (tx) => {
        if (normalizedClientUploadId) {
          const dup = await tx.userStoryItem.findFirst({
            where: {
              clientUploadId: normalizedClientUploadId,
              deletedAt: null,
              story: { userId, expiresAt: { gt: now } },
            },
          });
          if (dup) return dup;
        }

        let story = await tx.userStory.findFirst({
          where: { userId, expiresAt: { gt: now } },
          orderBy: { createdAt: 'desc' },
        });
        if (!story) {
          story = await tx.userStory.create({
            data: { userId, expiresAt },
          });
        }

        const maxOrder = await tx.userStoryItem.aggregate({
          where: { storyId: story.id, deletedAt: null },
          _max: { sortOrder: true },
        });

        return tx.userStoryItem.create({
          data: {
            storyId: story.id,
            mediaUrl: input.mediaUrl.trim(),
            thumbnailUrl: input.thumbnailUrl.trim(),
            posterUrl: input.posterUrl ?? null,
            messageType: input.messageType,
            videoDurationMs: input.videoDurationMs ?? null,
            width: input.width ?? null,
            height: input.height ?? null,
            overlayText: input.overlayText ?? null,
            overlayStyle: input.overlayStyle != null ? (input.overlayStyle as Prisma.InputJsonValue) : undefined,
            caption: normalizedCaption,
            clientUploadId: normalizedClientUploadId,
            sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          },
        });
      });

      const segment = formatManualSegment(item);
      await emitStoryNew(userId, segment);
      return segment;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && normalizedClientUploadId) {
        const existing = await prisma.userStoryItem.findFirst({
          where: {
            clientUploadId: normalizedClientUploadId,
            deletedAt: null,
            story: { userId, expiresAt: { gt: now } },
          },
        });
        if (existing) return formatManualSegment(existing);
      }
      throw e;
    }
  }
}

export { StorySourceType };
