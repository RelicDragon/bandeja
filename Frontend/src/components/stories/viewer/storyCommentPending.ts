import type { BasicUser } from '@/types';
import type { StoryCommentDto } from '@/api/storyEngagement';

export const STORY_COMMENT_PENDING_PREFIX = 'pending:';

export type StoryCommentPendingStatus = 'sending' | 'failed';

export type StoryCommentView = StoryCommentDto & {
  _pendingStatus?: StoryCommentPendingStatus;
  _clientMutationId?: string;
};

export function isPendingComment(comment: StoryCommentDto): comment is StoryCommentView {
  return comment.id.startsWith(STORY_COMMENT_PENDING_PREFIX);
}

/** Top-level thread parent for replies (API only accepts root parentId). */
export function resolveStoryCommentThreadParent(
  target: StoryCommentDto,
  rootComments: StoryCommentDto[]
): StoryCommentDto | null {
  if (isPendingComment(target)) return null;
  const rootId = target.parentId ?? target.id;
  return rootComments.find((c) => c.id === rootId) ?? (target.parentId ? null : target);
}

export function pendingCommentId(clientMutationId: string): string {
  return `${STORY_COMMENT_PENDING_PREFIX}${clientMutationId}`;
}

export function createOptimisticComment(params: {
  clientMutationId: string;
  body: string;
  author: BasicUser;
  parentId?: string;
  segmentOwnerId: string;
  status: StoryCommentPendingStatus;
}): StoryCommentView {
  const now = new Date().toISOString();
  return {
    id: pendingCommentId(params.clientMutationId),
    body: params.body,
    createdAt: now,
    author: params.author,
    likeCount: 0,
    viewerHasLiked: false,
    segmentOwnerHasLiked: false,
    replyCount: 0,
    isSegmentOwner: params.author.id === params.segmentOwnerId,
    parentId: params.parentId ?? null,
    _pendingStatus: params.status,
    _clientMutationId: params.clientMutationId,
  };
}

export function replaceCommentInList(
  list: StoryCommentDto[],
  matchId: string,
  next: StoryCommentDto
): StoryCommentDto[] {
  return list.map((c) => {
    if (c.id === matchId) return next;
    if (c.previewReplies?.length) {
      return { ...c, previewReplies: replaceCommentInList(c.previewReplies, matchId, next) };
    }
    return c;
  });
}

export function removeCommentFromList(list: StoryCommentDto[], commentId: string): StoryCommentDto[] {
  return list
    .filter((c) => c.id !== commentId)
    .map((c) =>
      c.previewReplies?.length
        ? { ...c, previewReplies: removeCommentFromList(c.previewReplies, commentId) }
        : c
    );
}
