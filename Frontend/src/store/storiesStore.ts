import { create } from 'zustand';
import {
  storiesApi,
  parseStorySegmentKey,
  STORY_FEED_TTL_MS,
  type StoryBubble,
  type StoryFeed,
  type StorySegment,
  type StoryViewEntry,
} from '@/api/stories';
import type { StoryCommentDto, StorySegmentEngagement } from '@/api/storyEngagement';
import { useAuthStore } from '@/store/authStore';

type StoryNewPayload = { ownerUserId: string; segment: StorySegment; user?: StoryBubble['user'] };
type StoryDeletedPayload = { ownerUserId: string; segmentKey: string };

const pendingViewEntries = new Map<string, StoryViewEntry>();
let markViewedFlushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushMarkViewed() {
  const entries = Array.from(pendingViewEntries.values());
  pendingViewEntries.clear();
  markViewedFlushTimer = null;
  if (entries.length === 0) return;
  try {
    await storiesApi.markViews(entries);
  } catch {
    pendingViewEntries.clear();
    for (const entry of entries) pendingViewEntries.set(`${entry.sourceType}:${entry.sourceId}`, entry);
  }
}

function scheduleMarkViewedFlush() {
  if (markViewedFlushTimer) return;
  markViewedFlushTimer = setTimeout(() => {
    void flushMarkViewed();
  }, 400);
}

function mergeViewedKeys(feed: StoryFeed | null, viewedKeys: Set<string>): Set<string> {
  const next = new Set(viewedKeys);
  feed?.bubbles.forEach((bubble) => {
    bubble.segments.forEach((seg) => {
      if (seg.viewed) next.add(seg.key);
    });
  });
  return next;
}

function sortBubbleSegments(segments: StorySegment[]): StorySegment[] {
  return [...segments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function segmentPreviewThumbnailUrl(segment: StorySegment): string | null {
  if (segment.sourceType === 'USER_STORY_ITEM' || segment.sourceType === 'GAME_PHOTO') {
    return segment.media.thumbnailUrl;
  }
  if ('game' in segment) {
    return segment.game.mainPhoto?.thumbnailUrl ?? segment.game.avatar ?? null;
  }
  return null;
}

function recomputeBubbleHasUnseen(bubble: StoryBubble, viewedKeys: Set<string>): StoryBubble {
  const hasUnseen = bubble.segments.some((s) => !viewedKeys.has(s.key) && !s.viewed);
  return { ...bubble, hasUnseen };
}

interface StoriesState {
  feed: StoryFeed | null;
  lastFetchedAt: number | null;
  isLoading: boolean;
  viewedKeys: Set<string>;
  fetchFeed: (force?: boolean) => Promise<StoryFeed | null>;
  markViewed: (entry: StoryViewEntry) => void;
  flushPendingViews: () => Promise<void>;
  applyStoryNew: (payload: StoryNewPayload) => void;
  applyStoryDeleted: (payload: StoryDeletedPayload) => void;
  applyStoryViewed: (payload: { ownerUserId: string; segmentKey: string; viewerId: string }) => void;
  patchSegmentEngagement: (
    ownerUserId: string,
    segmentKey: string,
    patch: Partial<StorySegmentEngagement>
  ) => void;
  applyStoryLike: (payload: {
    ownerUserId: string;
    sourceType: string;
    sourceId: string;
    likeCount: number;
    viewerId?: string;
    liked?: boolean;
  }) => void;
  applyStoryComment: (payload: {
    ownerUserId: string;
    sourceType: string;
    sourceId: string;
    commentCount: number;
    comment?: StoryCommentDto;
  }) => void;
  applyStoryCommentDeleted: (payload: {
    ownerUserId: string;
    sourceType: string;
    sourceId: string;
    commentCount: number;
  }) => void;
  applyStoryCommentLike: (payload: {
    commentId: string;
    likeCount: number;
    segmentOwnerHasLiked: boolean;
  }) => void;
  segmentCommentEvent: {
    segmentKey: string;
    comment: StoryCommentDto;
    commentCount: number;
    seq: number;
  } | null;
  commentLikePatches: Record<
    string,
    { likeCount: number; segmentOwnerHasLiked: boolean; seq: number }
  >;
  reset: () => void;
}

function patchBubbleSegmentEngagement(
  bubble: StoryBubble,
  segmentKey: string,
  patch: Partial<StorySegmentEngagement>
): StoryBubble {
  const segments = bubble.segments.map((seg) => {
    if (seg.key !== segmentKey) return seg;
    const engagement: StorySegmentEngagement = {
      likeCount: seg.engagement?.likeCount ?? 0,
      commentCount: seg.engagement?.commentCount ?? 0,
      viewerHasLiked: seg.engagement?.viewerHasLiked ?? false,
      viewerHasCommented: seg.engagement?.viewerHasCommented ?? false,
      caption: seg.engagement?.caption ?? null,
      ...patch,
    };
    return { ...seg, engagement };
  });
  return { ...bubble, segments };
}

export const useStoriesStore = create<StoriesState>((set, get) => ({
  feed: null,
  lastFetchedAt: null,
  isLoading: false,
  viewedKeys: new Set(),
  segmentCommentEvent: null,
  commentLikePatches: {},

  fetchFeed: async (force = false) => {
    const { lastFetchedAt, isLoading } = get();
    if (isLoading) return get().feed;
    if (!force && lastFetchedAt && Date.now() - lastFetchedAt < STORY_FEED_TTL_MS) {
      return get().feed;
    }

    set({ isLoading: true });
    try {
      const feed = await storiesApi.getFeed();
      set((s) => ({
        feed,
        lastFetchedAt: Date.now(),
        isLoading: false,
        viewedKeys: mergeViewedKeys(feed, s.viewedKeys),
      }));
      return feed;
    } catch {
      set({ isLoading: false });
      return get().feed;
    }
  },

  markViewed: (entry) => {
    const key = `${entry.sourceType}:${entry.sourceId}`;
    set((s) => {
      const viewedKeys = new Set(s.viewedKeys);
      viewedKeys.add(key);
      const feed = s.feed
        ? {
            ...s.feed,
            bubbles: s.feed.bubbles.map((bubble) => {
              if (bubble.user.id !== entry.ownerUserId) return bubble;
              const segments = bubble.segments.map((seg) =>
                seg.key === key ? { ...seg, viewed: true } : seg
              );
              return recomputeBubbleHasUnseen({ ...bubble, segments }, viewedKeys);
            }),
          }
        : s.feed;
      return { viewedKeys, feed };
    });
    pendingViewEntries.set(key, entry);
    scheduleMarkViewedFlush();
  },

  flushPendingViews: async () => {
    if (markViewedFlushTimer) {
      clearTimeout(markViewedFlushTimer);
      markViewedFlushTimer = null;
    }
    await flushMarkViewed();
  },

  applyStoryNew: ({ ownerUserId, segment, user }) => {
    set((s) => {
      if (!s.feed) return s;
      const bubbles = [...s.feed.bubbles];
      const idx = bubbles.findIndex((b) => b.user.id === ownerUserId);
      const previewFromSegment = segmentPreviewThumbnailUrl(segment);
      if (idx >= 0) {
        const bubble = bubbles[idx];
        if (bubble.segments.some((seg) => seg.key === segment.key)) return s;
        const segments = sortBubbleSegments([...bubble.segments, segment]).slice(-20);
        bubbles[idx] = recomputeBubbleHasUnseen(
          {
            ...bubble,
            ...(user ? { user } : {}),
            segments,
            previewThumbnailUrl: previewFromSegment ?? bubble.previewThumbnailUrl,
          },
          s.viewedKeys
        );
      } else {
        const bubbleUser =
          user ??
          (segment.sourceType === 'USER_STORY_ITEM'
            ? ({ id: ownerUserId } as StoryBubble['user'])
            : null);
        if (!bubbleUser) return s;
        bubbles.unshift(
          recomputeBubbleHasUnseen(
            {
              user: bubbleUser,
              isSelf: false,
              hasUnseen: true,
              previewThumbnailUrl: previewFromSegment,
              segments: [segment],
            },
            s.viewedKeys
          )
        );
      }
      return { feed: { ...s.feed, bubbles } };
    });
  },

  applyStoryDeleted: ({ ownerUserId, segmentKey }) => {
    set((s) => {
      if (!s.feed) return s;
      const bubbles = s.feed.bubbles
        .map((bubble) => {
          if (bubble.user.id !== ownerUserId) return bubble;
          const segments = bubble.segments.filter((seg) => seg.key !== segmentKey);
          return recomputeBubbleHasUnseen({ ...bubble, segments }, s.viewedKeys);
        })
        .filter((bubble) => bubble.isSelf || bubble.segments.length > 0);
      return { feed: { ...s.feed, bubbles } };
    });
  },

  applyStoryViewed: () => {},

  patchSegmentEngagement: (ownerUserId, segmentKey, patch) => {
    set((s) => {
      if (!s.feed) return s;
      return {
        feed: {
          ...s.feed,
          bubbles: s.feed.bubbles.map((bubble) =>
            bubble.user.id === ownerUserId
              ? patchBubbleSegmentEngagement(bubble, segmentKey, patch)
              : bubble
          ),
        },
      };
    });
  },

  applyStoryLike: ({ ownerUserId, sourceType, sourceId, likeCount, viewerId, liked }) => {
    const segmentKey = `${sourceType}:${sourceId}`;
    const currentUserId = useAuthStore.getState().user?.id;
    set((s) => {
      if (!s.feed) return s;
      const engagementPatch: Partial<StorySegmentEngagement> = { likeCount };
      if (viewerId && viewerId === currentUserId) {
        engagementPatch.viewerHasLiked = liked ?? true;
      }
      return {
        feed: {
          ...s.feed,
          bubbles: s.feed.bubbles.map((bubble) => {
            if (bubble.user.id !== ownerUserId) return bubble;
            return patchBubbleSegmentEngagement(bubble, segmentKey, engagementPatch);
          }),
        },
      };
    });
  },

  applyStoryComment: ({ ownerUserId, sourceType, sourceId, commentCount, comment }) => {
    const segmentKey = `${sourceType}:${sourceId}`;
    const currentUserId = useAuthStore.getState().user?.id;
    const engagementPatch: Partial<StorySegmentEngagement> = { commentCount };
    if (comment && currentUserId && comment.author.id === currentUserId) {
      engagementPatch.viewerHasCommented = true;
    }
    set((s) => {
      const feed = s.feed
        ? {
            ...s.feed,
            bubbles: s.feed.bubbles.map((bubble) =>
              bubble.user.id === ownerUserId
                ? patchBubbleSegmentEngagement(bubble, segmentKey, engagementPatch)
                : bubble
            ),
          }
        : s.feed;
      const segmentCommentEvent =
        comment && !comment.parentId
          ? { segmentKey, comment, commentCount, seq: Date.now() }
          : s.segmentCommentEvent;
      return { feed, segmentCommentEvent };
    });
  },

  applyStoryCommentDeleted: ({ ownerUserId, sourceType, sourceId, commentCount }) => {
    const segmentKey = `${sourceType}:${sourceId}`;
    set((s) => {
      if (!s.feed) return s;
      return {
        feed: {
          ...s.feed,
          bubbles: s.feed.bubbles.map((bubble) =>
            bubble.user.id === ownerUserId
              ? patchBubbleSegmentEngagement(bubble, segmentKey, { commentCount })
              : bubble
          ),
        },
      };
    });
  },

  applyStoryCommentLike: ({ commentId, likeCount, segmentOwnerHasLiked }) => {
    set((s) => ({
      commentLikePatches: {
        ...s.commentLikePatches,
        [commentId]: { likeCount, segmentOwnerHasLiked, seq: Date.now() },
      },
    }));
  },

  reset: () => {
    pendingViewEntries.clear();
    if (markViewedFlushTimer) {
      clearTimeout(markViewedFlushTimer);
      markViewedFlushTimer = null;
    }
    set({
      feed: null,
      lastFetchedAt: null,
      isLoading: false,
      viewedKeys: new Set(),
      segmentCommentEvent: null,
      commentLikePatches: {},
    });
  },
}));

export function storyViewEntryFromSegment(segment: StorySegment, ownerUserId: string): StoryViewEntry | null {
  const parsed = parseStorySegmentKey(segment.key);
  if (!parsed) return null;
  return {
    sourceType: parsed.sourceType,
    sourceId: parsed.sourceId,
    ownerUserId,
  };
}
