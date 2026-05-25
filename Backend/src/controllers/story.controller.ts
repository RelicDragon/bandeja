import { Response } from 'express';
import { MessageType } from '@prisma/client';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { StoryFeedService } from '../services/story/story.feed.service';
import { StoryCreateService } from '../services/story/story.create.service';
import { StoryDeleteService } from '../services/story/story.delete.service';
import { StoryViewService } from '../services/story/story.view.service';
import { processStoryImage, processStoryVideo } from '../services/story/story.media';
import { MAX_VIDEO_DURATION_MS } from '../services/story/story.constants';

export const getStoryFeed = asyncHandler(async (req: AuthRequest, res: Response) => {
  const feed = await StoryFeedService.getFeed(req.userId!);
  res.json({ success: true, data: feed });
});

export const createStoryItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const {
    mediaUrl,
    thumbnailUrl,
    posterUrl,
    messageType,
    videoDurationMs,
    width,
    height,
    overlayText,
    overlayStyle,
    caption,
    clientUploadId,
  } = req.body;

  if (!mediaUrl || !thumbnailUrl || !messageType) {
    throw new ApiError(400, 'mediaUrl, thumbnailUrl, and messageType are required');
  }
  if (messageType !== MessageType.IMAGE && messageType !== MessageType.VIDEO) {
    throw new ApiError(400, 'messageType must be IMAGE or VIDEO');
  }

  const segment = await StoryCreateService.createItem(req.userId!, {
    mediaUrl,
    thumbnailUrl,
    posterUrl,
    messageType,
    videoDurationMs: videoDurationMs != null ? Number(videoDurationMs) : null,
    width: width != null ? Number(width) : null,
    height: height != null ? Number(height) : null,
    overlayText,
    overlayStyle,
    caption,
    clientUploadId,
  });

  res.status(201).json({ success: true, data: segment });
});

export const deleteStoryItem = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await StoryDeleteService.deleteItem(req.userId!, req.params.itemId);
  res.json({ success: true, data: result });
});

export const markStoryViews = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { entries } = req.body;
  const result = await StoryViewService.markViewed(req.userId!, entries);
  res.json({ success: true, data: result });
});

export const uploadStoryImage = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    throw new ApiError(400, 'No image file provided');
  }
  const result = await processStoryImage(req.file.buffer, req.file.originalname);
  res.status(200).json({
    success: true,
    data: {
      mediaUrl: result.mediaUrl,
      thumbnailUrl: result.thumbnailUrl,
      width: result.width,
      height: result.height,
    },
  });
});

export const uploadStoryVideo = asyncHandler(async (req: AuthRequest, res: Response) => {
  const bucket = req.files as Record<string, Express.Multer.File[]> | undefined;
  const videoFile = bucket?.video?.[0];
  if (!videoFile) {
    throw new ApiError(400, 'No video file provided');
  }

  const posterFile = bucket?.poster?.[0];
  const { durationMs, width, height } = req.body;
  const parsedDuration = durationMs != null && durationMs !== '' ? Number(durationMs) : undefined;
  if (parsedDuration != null && !Number.isNaN(parsedDuration) && parsedDuration > MAX_VIDEO_DURATION_MS) {
    throw new ApiError(400, 'Video must be 60 seconds or less');
  }

  const parsedWidth = width != null && width !== '' ? Number(width) : undefined;
  const parsedHeight = height != null && height !== '' ? Number(height) : undefined;

  const result = await processStoryVideo(
    videoFile.buffer,
    videoFile.originalname,
    posterFile?.buffer,
    {
      durationMs: parsedDuration !== undefined && !Number.isNaN(parsedDuration) ? parsedDuration : undefined,
      width: parsedWidth !== undefined && !Number.isNaN(parsedWidth) ? parsedWidth : undefined,
      height: parsedHeight !== undefined && !Number.isNaN(parsedHeight) ? parsedHeight : undefined,
    }
  );

  res.status(200).json({
    success: true,
    data: {
      mediaUrl: result.mediaUrl,
      thumbnailUrl: result.thumbnailUrl,
      posterUrl: result.posterUrl,
      videoDurationMs: result.videoDurationMs,
      width: result.width,
      height: result.height,
    },
  });
});
