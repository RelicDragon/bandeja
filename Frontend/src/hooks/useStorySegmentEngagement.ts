import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  storyEngagementApi,
  type StorySegmentEngagement,
} from '@/api/storyEngagement';
import { parseStorySegmentKey, STORY_FEED_TTL_MS, type StorySourceType } from '@/api/stories';
import { useStoriesStore } from '@/store/storiesStore';
import { useAuthStore } from '@/store/authStore';
import { lightHaptic } from '@/utils/lightHaptic';

type UseStorySegmentEngagementParams = {
  segmentKey: string;
  ownerUserId: string;
  enabled: boolean;
  initialEngagement?: StorySegmentEngagement;
};

const DEFAULT_ENGAGEMENT: StorySegmentEngagement = {
  likeCount: 0,
  commentCount: 0,
  viewerHasLiked: false,
  viewerHasCommented: false,
  caption: null,
};

function engagementEqual(a: StorySegmentEngagement, b: StorySegmentEngagement): boolean {
  return (
    a.likeCount === b.likeCount &&
    a.commentCount === b.commentCount &&
    a.viewerHasLiked === b.viewerHasLiked &&
    a.viewerHasCommented === b.viewerHasCommented &&
    a.caption === b.caption
  );
}

function isOfflineError(err: unknown): boolean {
  const e = err as { message?: string; code?: string };
  return e?.message === 'Network Error' || e?.code === 'ERR_NETWORK';
}

export function useStorySegmentEngagement({
  segmentKey,
  ownerUserId,
  enabled,
  initialEngagement,
}: UseStorySegmentEngagementParams) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const patchSegmentEngagement = useStoriesStore((s) => s.patchSegmentEngagement);
  const lastFetchedAt = useStoriesStore((s) => s.lastFetchedAt);
  const feedEngagement = useStoriesStore((s) => {
    const bubble = s.feed?.bubbles.find((b) => b.user.id === ownerUserId);
    const seg = bubble?.segments.find((item) => item.key === segmentKey);
    return seg?.engagement;
  });

  const [engagement, setEngagement] = useState<StorySegmentEngagement>(
    () => feedEngagement ?? initialEngagement ?? DEFAULT_ENGAGEMENT
  );
  const likePendingRef = useRef(false);
  const fetchedForKeyRef = useRef<string | null>(null);

  useEffect(() => {
    fetchedForKeyRef.current = null;
    setEngagement(feedEngagement ?? initialEngagement ?? DEFAULT_ENGAGEMENT);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on segmentKey; feed sync below
  }, [segmentKey]);

  useEffect(() => {
    const next = feedEngagement ?? initialEngagement;
    if (!next) return;
    setEngagement((prev) => (engagementEqual(prev, next) ? prev : next));
  }, [feedEngagement, initialEngagement]);

  useEffect(() => {
    if (!enabled || !segmentKey) return;
    if (fetchedForKeyRef.current === segmentKey) return;

    const parsed = parseStorySegmentKey(segmentKey);
    if (!parsed) return;

    const feedFresh =
      lastFetchedAt != null && Date.now() - lastFetchedAt <= STORY_FEED_TTL_MS;
    const hasFeedCounts = (feedEngagement ?? initialEngagement) != null;
    if (feedFresh && hasFeedCounts) {
      fetchedForKeyRef.current = segmentKey;
      return;
    }

    fetchedForKeyRef.current = segmentKey;
    void storyEngagementApi
      .getEngagement(parsed.sourceType, parsed.sourceId, ownerUserId)
      .then((data) => {
        if (fetchedForKeyRef.current !== segmentKey) return;
        setEngagement((prev) => (engagementEqual(prev, data) ? prev : data));
        patchSegmentEngagement(ownerUserId, segmentKey, data);
      })
      .catch(() => {
        if (fetchedForKeyRef.current === segmentKey) fetchedForKeyRef.current = null;
      });
  }, [enabled, segmentKey, ownerUserId, lastFetchedAt, feedEngagement, initialEngagement, patchSegmentEngagement]);

  const toggleLike = useCallback(async () => {
    if (!userId) {
      toast.error(t('chat.reactions.loginToReact'));
      return;
    }
    const parsed = parseStorySegmentKey(segmentKey);
    if (!parsed || likePendingRef.current) return;

    let prevSnapshot: StorySegmentEngagement = DEFAULT_ENGAGEMENT;
    setEngagement((prev) => {
      prevSnapshot = prev;
      return {
        ...prev,
        viewerHasLiked: !prev.viewerHasLiked,
        likeCount: Math.max(0, prev.likeCount + (prev.viewerHasLiked ? -1 : 1)),
      };
    });

    likePendingRef.current = true;
    lightHaptic();

    try {
      const res = await storyEngagementApi.toggleSegmentLike(
        parsed.sourceType as StorySourceType,
        parsed.sourceId,
        ownerUserId
      );
      const next: StorySegmentEngagement = {
        ...prevSnapshot,
        viewerHasLiked: res.liked,
        likeCount: res.likeCount,
      };
      setEngagement((prev) => (engagementEqual(prev, next) ? prev : next));
      patchSegmentEngagement(ownerUserId, segmentKey, next);
    } catch (err) {
      setEngagement((prev) => (engagementEqual(prev, prevSnapshot) ? prev : prevSnapshot));
      if (isOfflineError(err)) toast.error(t('stories.viewer.offline'));
    } finally {
      likePendingRef.current = false;
    }
  }, [userId, segmentKey, ownerUserId, patchSegmentEngagement, t]);

  const setCommentCount = useCallback(
    (commentCount: number) => {
      setEngagement((prev) => {
        if (prev.commentCount === commentCount) return prev;
        const next = { ...prev, commentCount };
        patchSegmentEngagement(ownerUserId, segmentKey, next);
        return next;
      });
    },
    [ownerUserId, segmentKey, patchSegmentEngagement]
  );

  const setViewerHasCommented = useCallback(
    (viewerHasCommented: boolean) => {
      setEngagement((prev) => {
        if (prev.viewerHasCommented === viewerHasCommented) return prev;
        const next = { ...prev, viewerHasCommented };
        patchSegmentEngagement(ownerUserId, segmentKey, next);
        return next;
      });
    },
    [ownerUserId, segmentKey, patchSegmentEngagement]
  );

  return {
    engagement,
    toggleLike,
    setCommentCount,
    setViewerHasCommented,
    setEngagement,
  };
}
