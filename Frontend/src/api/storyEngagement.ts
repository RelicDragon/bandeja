import api from './axios';
import type { ApiResponse, BasicUser } from '@/types';
import type { StorySourceType } from './stories';

export type StorySegmentEngagement = {
  caption?: string | null;
  likeCount: number;
  commentCount: number;
  viewerHasLiked: boolean;
};

export type StoryCommentDto = {
  id: string;
  body: string;
  createdAt: string;
  author: BasicUser;
  likeCount: number;
  viewerHasLiked: boolean;
  segmentOwnerHasLiked: boolean;
  replyCount: number;
  isSegmentOwner: boolean;
  parentId?: string | null;
  deletedAt?: string | null;
  previewReplies?: StoryCommentDto[];
};

export type StoryCommentsPage = {
  comments: StoryCommentDto[];
  nextCursor: string | null;
};

export type StoryLikersPage = {
  users: BasicUser[];
  nextCursor: string | null;
};

export type ToggleSegmentLikeResponse = {
  liked: boolean;
  likeCount: number;
};

export type ToggleCommentLikeResponse = {
  liked: boolean;
  likeCount: number;
  segmentOwnerHasLiked: boolean;
};

export type CreateStoryCommentPayload = {
  body: string;
  parentId?: string;
  clientMutationId?: string;
};

export type StoryCommentReportReason =
  | 'SPAM'
  | 'HARASSMENT'
  | 'INAPPROPRIATE_CONTENT'
  | 'FAKE_INFORMATION'
  | 'OTHER';

function segmentBase(sourceType: StorySourceType, sourceId: string): string {
  return `/stories/segments/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}`;
}

export const storyEngagementApi = {
  getEngagement: async (
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string
  ): Promise<StorySegmentEngagement> => {
    const response = await api.get<ApiResponse<StorySegmentEngagement>>(
      `${segmentBase(sourceType, sourceId)}/engagement`,
      { params: { ownerUserId } }
    );
    return response.data.data;
  },

  toggleSegmentLike: async (
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string
  ): Promise<ToggleSegmentLikeResponse> => {
    const response = await api.post<ApiResponse<ToggleSegmentLikeResponse>>(
      `${segmentBase(sourceType, sourceId)}/like/toggle`,
      {},
      { params: { ownerUserId } }
    );
    return response.data.data;
  },

  getLikers: async (
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string,
    cursor?: string
  ): Promise<StoryLikersPage> => {
    const response = await api.get<ApiResponse<StoryLikersPage>>(
      `${segmentBase(sourceType, sourceId)}/likes`,
      { params: { ownerUserId, cursor } }
    );
    return response.data.data;
  },

  getComments: async (
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string,
    cursor?: string
  ): Promise<StoryCommentsPage> => {
    const response = await api.get<ApiResponse<StoryCommentsPage>>(
      `${segmentBase(sourceType, sourceId)}/comments`,
      { params: { ownerUserId, cursor } }
    );
    return response.data.data;
  },

  getCommentReplies: async (commentId: string, cursor?: string): Promise<StoryCommentsPage> => {
    const response = await api.get<
      ApiResponse<{ replies: StoryCommentDto[]; nextCursor: string | null }>
    >(`/stories/comments/${encodeURIComponent(commentId)}/replies`, { params: { cursor } });
    const { replies, nextCursor } = response.data.data;
    return { comments: replies ?? [], nextCursor };
  },

  createComment: async (
    sourceType: StorySourceType,
    sourceId: string,
    ownerUserId: string,
    payload: CreateStoryCommentPayload
  ): Promise<{ comment: StoryCommentDto; commentCount: number }> => {
    const response = await api.post<
      ApiResponse<{ comment: StoryCommentDto; commentCount: number } | StoryCommentDto>
    >(`${segmentBase(sourceType, sourceId)}/comments`, payload, { params: { ownerUserId } });
    const data = response.data.data;
    if (data && typeof data === 'object' && 'comment' in data && data.comment) {
      return data as { comment: StoryCommentDto; commentCount: number };
    }
    return { comment: data as StoryCommentDto, commentCount: 0 };
  },

  deleteComment: async (commentId: string): Promise<{ commentCount: number }> => {
    const response = await api.delete<ApiResponse<{ commentCount: number }>>(
      `/stories/comments/${encodeURIComponent(commentId)}`
    );
    return response.data.data;
  },

  toggleCommentLike: async (commentId: string): Promise<ToggleCommentLikeResponse> => {
    const response = await api.post<ApiResponse<ToggleCommentLikeResponse>>(
      `/stories/comments/${encodeURIComponent(commentId)}/like/toggle`
    );
    return response.data.data;
  },

  reportComment: async (
    commentId: string,
    payload: { reason: StoryCommentReportReason; description?: string }
  ): Promise<void> => {
    await api.post(`/stories/comments/${encodeURIComponent(commentId)}/report`, payload);
  },
};

export const STORY_COMMENT_MAX_CHARS = 500;
export const STORY_CAPTION_MAX_CHARS = 220;
