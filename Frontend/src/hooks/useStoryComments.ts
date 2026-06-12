import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  storyEngagementApi,
  STORY_COMMENT_MAX_CHARS,
  type StoryCommentDto,
} from '@/api/storyEngagement';
import { parseStorySegmentKey, type StorySourceType } from '@/api/stories';
import {
  createOptimisticComment,
  isPendingComment,
  pendingCommentId,
  removeCommentFromList,
  replaceCommentInList,
  resolveStoryCommentThreadParent,
  type StoryCommentView,
} from '@/components/stories/viewer/storyCommentPending';
import { useAuthStore } from '@/store/authStore';
import { useStoriesStore } from '@/store/storiesStore';
import { lightHaptic } from '@/utils/lightHaptic';

const PENDING_FAIL_MS = 5000;

function isOfflineError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return e?.message === 'Network Error' || e?.code === 'ERR_NETWORK';
}

function mergeComment(prev: StoryCommentDto[], comment: StoryCommentDto | undefined): StoryCommentDto[] {
  if (!comment?.id) return prev;
  if (prev.some((c) => c?.id === comment.id)) return prev;
  return [comment, ...prev];
}

function patchCommentInList(
  list: StoryCommentDto[],
  commentId: string,
  patch: Partial<StoryCommentDto>
): StoryCommentDto[] {
  return list.map((c) => {
    if (c.id === commentId) return { ...c, ...patch };
    if (c.previewReplies?.length) {
      return {
        ...c,
        previewReplies: patchCommentInList(c.previewReplies, commentId, patch),
      };
    }
    return c;
  });
}

function stripPendingFields(comment: StoryCommentDto): StoryCommentDto {
  const view = comment as StoryCommentView;
  if (!view._pendingStatus && !view._clientMutationId) return comment;
  const { _pendingStatus: _s, _clientMutationId: _c, ...rest } = view;
  return rest;
}

function viewerHasActiveCommentOnSegment(
  userId: string | undefined,
  comments: StoryCommentDto[],
  expandedReplies: Record<string, StoryCommentDto[]>
): boolean {
  if (!userId) return false;
  const isActive = (c: StoryCommentDto) => !c.deletedAt && c.author.id === userId;
  if (comments.some(isActive)) return true;
  return Object.values(expandedReplies).some((list) => list.some(isActive));
}

type UseStoryCommentsParams = {
  segmentKey: string;
  ownerUserId: string;
  enabled: boolean;
  onCommentCountChange: (count: number) => void;
  onViewerHasCommentedChange?: (commented: boolean) => void;
};

export function useStoryComments({
  segmentKey,
  ownerUserId,
  enabled,
  onCommentCountChange,
  onViewerHasCommentedChange,
}: UseStoryCommentsParams) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const [comments, setComments] = useState<StoryCommentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<StoryCommentDto | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, StoryCommentDto[]>>({});
  const [repliesLoading, setRepliesLoading] = useState<Record<string, boolean>>({});
  const loadedRef = useRef(false);
  const loadingRef = useRef(false);
  const nextCursorRef = useRef<string | null>(null);
  const pendingFailTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const commentCountRef = useRef(0);

  const syncViewerHasCommented = useCallback(
    (nextComments: StoryCommentDto[], nextReplies: Record<string, StoryCommentDto[]>) => {
      onViewerHasCommentedChange?.(
        viewerHasActiveCommentOnSegment(userId, nextComments, nextReplies)
      );
    },
    [onViewerHasCommentedChange, userId]
  );

  const clearPendingFailTimer = useCallback((clientMutationId: string) => {
    const timer = pendingFailTimersRef.current.get(clientMutationId);
    if (timer) {
      clearTimeout(timer);
      pendingFailTimersRef.current.delete(clientMutationId);
    }
  }, []);

  const markPendingFailed = useCallback(
    (clientMutationId: string) => {
      clearPendingFailTimer(clientMutationId);
      const pendingId = pendingCommentId(clientMutationId);
      setComments((prev) =>
        patchCommentInList(prev, pendingId, { _pendingStatus: 'failed' } as Partial<StoryCommentDto>)
      );
      setExpandedReplies((s) => {
        const next = { ...s };
        for (const key of Object.keys(next)) {
          next[key] = patchCommentInList(next[key]!, pendingId, {
            _pendingStatus: 'failed',
          } as Partial<StoryCommentDto>);
        }
        return next;
      });
    },
    [clearPendingFailTimer]
  );

  const schedulePendingFail = useCallback(
    (clientMutationId: string) => {
      clearPendingFailTimer(clientMutationId);
      pendingFailTimersRef.current.set(
        clientMutationId,
        setTimeout(() => markPendingFailed(clientMutationId), PENDING_FAIL_MS)
      );
    },
    [clearPendingFailTimer, markPendingFailed]
  );

  const applyOptimisticToLists = useCallback(
    (optimistic: StoryCommentView, parent: StoryCommentDto | null) => {
      if (parent) {
        setComments((prev) =>
          patchCommentInList(prev, parent.id, {
            replyCount: (parent.replyCount ?? 0) + 1,
            previewReplies: mergeComment(parent.previewReplies ?? [], optimistic).slice(-2),
          })
        );
        setExpandedReplies((s) => ({
          ...s,
          [parent.id]: mergeComment(s[parent.id] ?? [], optimistic),
        }));
      } else {
        setComments((prev) => mergeComment(prev, optimistic));
      }
    },
    []
  );

  const settlePendingSuccess = useCallback(
    (
      clientMutationId: string,
      serverComment: StoryCommentDto,
      commentCount: number,
      parent: StoryCommentDto | null
    ) => {
      clearPendingFailTimer(clientMutationId);
      const pendingId = pendingCommentId(clientMutationId);
      const confirmed = stripPendingFields(serverComment);
      commentCountRef.current = commentCount;
      onCommentCountChange(commentCount);

      if (parent) {
        setComments((prev) => {
          const parentRow = prev.find((c) => c.id === parent.id);
          const previewReplies = replaceCommentInList(
            parentRow?.previewReplies ?? parent.previewReplies ?? [],
            pendingId,
            confirmed
          ).slice(-2);
          return patchCommentInList(prev, parent.id, { previewReplies });
        });
        setExpandedReplies((s) => ({
          ...s,
          [parent.id]: replaceCommentInList(s[parent.id] ?? [], pendingId, confirmed),
        }));
      } else {
        setComments((prev) => replaceCommentInList(prev, pendingId, confirmed));
      }
    },
    [clearPendingFailTimer, onCommentCountChange]
  );

  const loadComments = useCallback(
    async (reset = false) => {
      const parsed = parseStorySegmentKey(segmentKey);
      if (!parsed || !enabled) return;
      if (loadingRef.current) return;
      if (!reset && nextCursorRef.current === null && loadedRef.current) return;

      loadingRef.current = true;
      setLoading(true);
      setError(false);
      try {
        const page = await storyEngagementApi.getComments(
          parsed.sourceType as StorySourceType,
          parsed.sourceId,
          ownerUserId,
          reset ? undefined : nextCursorRef.current ?? undefined
        );
        const pageComments = page.comments.filter((c): c is StoryCommentDto => Boolean(c?.id));
        setComments((prev) => (reset ? pageComments : [...prev, ...pageComments]));
        nextCursorRef.current = page.nextCursor;
        setNextCursor(page.nextCursor);
        loadedRef.current = true;
      } catch {
        setError(true);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [segmentKey, ownerUserId, enabled]
  );

  useEffect(() => {
    if (!enabled) {
      setReplyTo(null);
      return;
    }
    loadedRef.current = false;
    nextCursorRef.current = null;
    setComments([]);
    setNextCursor(null);
    setExpandedReplies({});
    for (const timer of pendingFailTimersRef.current.values()) clearTimeout(timer);
    pendingFailTimersRef.current.clear();
    void loadComments(true);
  }, [enabled, segmentKey, ownerUserId, loadComments]);

  useEffect(
    () => () => {
      for (const timer of pendingFailTimersRef.current.values()) clearTimeout(timer);
      pendingFailTimersRef.current.clear();
    },
    []
  );

  const resetAndLoad = useCallback(() => {
    loadedRef.current = false;
    nextCursorRef.current = null;
    setComments([]);
    setNextCursor(null);
    setExpandedReplies({});
    void loadComments(true);
  }, [loadComments]);

  const loadReplies = useCallback(async (parentId: string) => {
    if (repliesLoading[parentId]) return;
    setRepliesLoading((s) => ({ ...s, [parentId]: true }));
    try {
      const page = await storyEngagementApi.getCommentReplies(parentId);
      setExpandedReplies((s) => ({
        ...s,
        [parentId]: page.nextCursor
          ? [...(s[parentId] ?? []), ...page.comments]
          : [...(s[parentId] ?? []), ...page.comments],
      }));
    } catch {
      toast.error(t('stories.viewer.loadRepliesFailed'));
    } finally {
      setRepliesLoading((s) => ({ ...s, [parentId]: false }));
    }
  }, [repliesLoading, t]);

  const uploadComment = useCallback(
    async (
      trimmed: string,
      clientMutationId: string,
      parent: StoryCommentDto | null
    ) => {
      const parsed = parseStorySegmentKey(segmentKey);
      if (!parsed) return;

      try {
        const res = await storyEngagementApi.createComment(
          parsed.sourceType as StorySourceType,
          parsed.sourceId,
          ownerUserId,
          {
            body: trimmed,
            parentId: parent?.id && !isPendingComment(parent) ? parent.id : undefined,
            clientMutationId,
          }
        );
        if (!res.comment?.id) {
          markPendingFailed(clientMutationId);
          toast.error(t('stories.viewer.commentFailed'));
          return;
        }
        settlePendingSuccess(clientMutationId, res.comment, res.commentCount, parent);
      } catch (err) {
        markPendingFailed(clientMutationId);
        if (isOfflineError(err)) toast.error(t('stories.viewer.offline'));
      }
    },
    [segmentKey, ownerUserId, markPendingFailed, settlePendingSuccess, t]
  );

  const submitComment = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || trimmed.length > STORY_COMMENT_MAX_CHARS) return;
      if (!user) return;

      const clientMutationId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `cm-${Date.now()}`;

      const parent = replyTo ? resolveStoryCommentThreadParent(replyTo, comments) : null;
      const optimistic = createOptimisticComment({
        clientMutationId,
        body: trimmed,
        author: user,
        parentId: parent?.id,
        segmentOwnerId: ownerUserId,
        status: 'sending',
      });

      setReplyTo(null);
      applyOptimisticToLists(optimistic, parent);
      commentCountRef.current += 1;
      onCommentCountChange(commentCountRef.current);
      onViewerHasCommentedChange?.(true);
      schedulePendingFail(clientMutationId);
      void uploadComment(trimmed, clientMutationId, parent);
    },
    [
      user,
      replyTo,
      comments,
      ownerUserId,
      applyOptimisticToLists,
      onCommentCountChange,
      onViewerHasCommentedChange,
      schedulePendingFail,
      uploadComment,
    ]
  );

  const discardPendingComment = useCallback(
    (commentId: string, parentId?: string) => {
      const view = [...comments, ...Object.values(expandedReplies).flat()].find(
        (c) => c.id === commentId
      ) as StoryCommentView | undefined;
      if (view?._clientMutationId) clearPendingFailTimer(view._clientMutationId);

      let nextComments = comments;
      let nextReplies = expandedReplies;
      if (parentId) {
        nextReplies = {
          ...expandedReplies,
          [parentId]: removeCommentFromList(expandedReplies[parentId] ?? [], commentId),
        };
        nextComments = patchCommentInList(comments, parentId, {
          replyCount: Math.max(0, (comments.find((c) => c.id === parentId)?.replyCount ?? 1) - 1),
        });
        setExpandedReplies(nextReplies);
        setComments(nextComments);
      } else {
        nextComments = removeCommentFromList(comments, commentId);
        setComments(nextComments);
      }
      commentCountRef.current = Math.max(0, commentCountRef.current - 1);
      onCommentCountChange(commentCountRef.current);
      syncViewerHasCommented(nextComments, nextReplies);
    },
    [comments, expandedReplies, clearPendingFailTimer, onCommentCountChange, syncViewerHasCommented]
  );

  const retryPendingComment = useCallback(
    (commentId: string) => {
      const all = [...comments, ...Object.values(expandedReplies).flat()];
      const pending = all.find((c) => c.id === commentId) as StoryCommentView | undefined;
      if (!pending?._clientMutationId || pending._pendingStatus !== 'failed') return;

      const clientMutationId = pending._clientMutationId;
      const trimmed = pending.body;
      const parent = pending.parentId
        ? comments.find((c) => c.id === pending.parentId) ?? null
        : null;

      setComments((prev) =>
        patchCommentInList(prev, commentId, { _pendingStatus: 'sending' } as Partial<StoryCommentDto>)
      );
      setExpandedReplies((s) => {
        const next = { ...s };
        for (const key of Object.keys(next)) {
          next[key] = patchCommentInList(next[key]!, commentId, {
            _pendingStatus: 'sending',
          } as Partial<StoryCommentDto>);
        }
        return next;
      });
      schedulePendingFail(clientMutationId);
      void uploadComment(trimmed, clientMutationId, parent);
    },
    [comments, expandedReplies, schedulePendingFail, uploadComment]
  );

  const deleteComment = useCallback(
    async (commentId: string, parentId?: string) => {
      if (isPendingComment({ id: commentId } as StoryCommentDto)) {
        discardPendingComment(commentId, parentId);
        return;
      }
      try {
        const res = await storyEngagementApi.deleteComment(commentId);
        commentCountRef.current = res.commentCount;
        onCommentCountChange(res.commentCount);
        if (parentId) {
          const nextReplies = {
            ...expandedReplies,
            [parentId]: (expandedReplies[parentId] ?? []).map((c) =>
              c.id === commentId ? { ...c, deletedAt: new Date().toISOString(), body: '' } : c
            ),
          };
          const nextComments = patchCommentInList(comments, parentId, {
            replyCount: Math.max(
              0,
              (comments.find((c) => c.id === parentId)?.replyCount ?? 1) - 1
            ),
          });
          setExpandedReplies(nextReplies);
          setComments(nextComments);
          syncViewerHasCommented(nextComments, nextReplies);
        } else {
          const nextComments = comments.map((c) =>
            c.id === commentId ? { ...c, deletedAt: new Date().toISOString(), body: '' } : c
          );
          setComments(nextComments);
          syncViewerHasCommented(nextComments, expandedReplies);
        }
      } catch {
        toast.error(t('stories.viewer.deleteFailed'));
      }
    },
    [comments, expandedReplies, discardPendingComment, onCommentCountChange, syncViewerHasCommented, t]
  );

  const toggleCommentLike = useCallback(
    async (commentId: string) => {
      if (isPendingComment({ id: commentId } as StoryCommentDto)) return;
      if (!userId) {
        toast.error(t('chat.reactions.loginToReact'));
        return;
      }
      const findComment = (list: StoryCommentDto[]): StoryCommentDto | undefined => {
        for (const c of list) {
          if (c.id === commentId) return c;
          if (c.previewReplies) {
            const nested = findComment(c.previewReplies);
            if (nested) return nested;
          }
        }
        return undefined;
      };
      const target =
        findComment(comments) ??
        Object.values(expandedReplies)
          .flat()
          .find((c) => c.id === commentId);
      if (!target || isPendingComment(target)) return;

      const prevLiked = target.viewerHasLiked;
      const prevCount = target.likeCount;
      const prevOwnerLiked = target.segmentOwnerHasLiked;
      const ownerToggling = userId === ownerUserId;
      const optimistic = {
        viewerHasLiked: !prevLiked,
        likeCount: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
        segmentOwnerHasLiked: ownerToggling ? !prevOwnerLiked : prevOwnerLiked,
      };
      setComments((prev) => patchCommentInList(prev, commentId, optimistic));
      setExpandedReplies((s) => {
        const next = { ...s };
        for (const key of Object.keys(next)) {
          next[key] = patchCommentInList(next[key]!, commentId, optimistic);
        }
        return next;
      });
      lightHaptic();

      const applyLikePatch = (patch: Partial<StoryCommentDto>) => {
        setComments((prev) => patchCommentInList(prev, commentId, patch));
        setExpandedReplies((s) => {
          const next = { ...s };
          for (const key of Object.keys(next)) {
            next[key] = patchCommentInList(next[key]!, commentId, patch);
          }
          return next;
        });
      };

      try {
        const res = await storyEngagementApi.toggleCommentLike(commentId);
        applyLikePatch({
          viewerHasLiked: res.liked,
          likeCount: res.likeCount,
          segmentOwnerHasLiked: res.segmentOwnerHasLiked,
        });
      } catch (err) {
        applyLikePatch({
          viewerHasLiked: prevLiked,
          likeCount: prevCount,
          segmentOwnerHasLiked: prevOwnerLiked,
        });
        if (isOfflineError(err)) toast.error(t('stories.viewer.offline'));
      }
    },
    [userId, ownerUserId, comments, expandedReplies, t]
  );

  const prependComment = useCallback((comment: StoryCommentDto, commentCount: number) => {
    commentCountRef.current = commentCount;
    onCommentCountChange(commentCount);
    if (comment.parentId) return;
    setComments((prev) => mergeComment(prev, comment));
  }, [onCommentCountChange]);

  const segmentCommentEvent = useStoriesStore((s) => s.segmentCommentEvent);
  const commentLikePatches = useStoriesStore((s) => s.commentLikePatches);

  useEffect(() => {
    if (!enabled || !segmentCommentEvent || segmentCommentEvent.segmentKey !== segmentKey) return;
    const { comment, commentCount } = segmentCommentEvent;
    if (comment.author.id === userId) {
      commentCountRef.current = commentCount;
      onCommentCountChange(commentCount);
      onViewerHasCommentedChange?.(true);
    } else {
      prependComment(comment, commentCount);
    }
    useStoriesStore.setState({ segmentCommentEvent: null });
  }, [
    enabled,
    segmentKey,
    segmentCommentEvent,
    prependComment,
    userId,
    onCommentCountChange,
    onViewerHasCommentedChange,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const entries = Object.entries(commentLikePatches);
    if (entries.length === 0) return;
    for (const [commentId, patch] of entries) {
      setComments((prev) => patchCommentInList(prev, commentId, patch));
      setExpandedReplies((s) => {
        const next = { ...s };
        for (const key of Object.keys(next)) {
          next[key] = patchCommentInList(next[key]!, commentId, patch);
        }
        return next;
      });
    }
  }, [enabled, commentLikePatches]);

  return {
    comments,
    loading,
    error,
    nextCursor,
    replyTo,
    setReplyTo,
    expandedReplies,
    repliesLoading,
    loadComments,
    resetAndLoad,
    loadReplies,
    submitComment,
    deleteComment,
    toggleCommentLike,
    prependComment,
    retryPendingComment,
    discardPendingComment,
  };
}
