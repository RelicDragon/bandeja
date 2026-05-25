import { StorySourceType } from '@prisma/client';
import type { StoryCommentDto } from './storyEngagement.dto';

function getIo() {
  const socketService = (global as {
    socketService?: {
      io?: {
        to: (room: string) => { emit: (event: string, payload: unknown) => void };
        emit: (event: string, payload: unknown) => void;
      };
    };
  }).socketService;
  return socketService?.io ?? null;
}

export type StoryLikeEventPayload = {
  sourceType: StorySourceType;
  sourceId: string;
  ownerUserId: string;
  likeCount: number;
  viewerId?: string;
  liked?: boolean;
};

export type StoryCommentEventPayload = {
  comment: StoryCommentDto;
  commentCount: number;
  ownerUserId: string;
  sourceType: StorySourceType;
  sourceId: string;
};

export type StoryCommentDeletedEventPayload = {
  commentId: string;
  commentCount: number;
  ownerUserId: string;
  sourceType: StorySourceType;
  sourceId: string;
};

export type StoryCommentLikeEventPayload = {
  commentId: string;
  likeCount: number;
  segmentOwnerHasLiked: boolean;
};

export function emitStoryLike(payload: StoryLikeEventPayload): void {
  const io = getIo();
  if (!io) return;
  io.to(`notify-user-${payload.ownerUserId}`).emit('story:like', payload);
}

export function emitStoryComment(payload: StoryCommentEventPayload): void {
  const io = getIo();
  if (!io) return;
  io.to(`notify-user-${payload.ownerUserId}`).emit('story:comment', payload);
}

export function emitStoryCommentDeleted(payload: StoryCommentDeletedEventPayload): void {
  const io = getIo();
  if (!io) return;
  io.to(`notify-user-${payload.ownerUserId}`).emit('story:comment:deleted', payload);
}

export function emitStoryCommentLike(payload: StoryCommentLikeEventPayload): void {
  const io = getIo();
  if (!io) return;
  io.emit('story:comment:like', payload);
}
