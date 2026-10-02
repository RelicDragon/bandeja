/**
 * Consumes `?story=<ownerUserId>&storySegment=<sourceType:sourceId>` on Home.
 *
 * A story like / comment / reply push lands here. The params are read **once**
 * and stripped from the URL straight away (refresh or back never reopens the
 * viewer); the target survives in state until the rail's feed has loaded and
 * the rail calls `consume`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export const STORY_DEEP_LINK_PARAM = 'story';
export const STORY_SEGMENT_DEEP_LINK_PARAM = 'storySegment';

export interface StoryDeepLinkTarget {
  ownerUserId: string;
  segmentKey: string | null;
}

export function useStoryDeepLink(): {
  target: StoryDeepLinkTarget | null;
  consume: () => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const [target, setTarget] = useState<StoryDeepLinkTarget | null>(null);
  const ownerUserId = searchParams.get(STORY_DEEP_LINK_PARAM);
  const segmentKey = searchParams.get(STORY_SEGMENT_DEEP_LINK_PARAM);

  useEffect(() => {
    if (!ownerUserId) return;
    setTarget({ ownerUserId, segmentKey: segmentKey || null });
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(STORY_DEEP_LINK_PARAM);
        next.delete(STORY_SEGMENT_DEEP_LINK_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [ownerUserId, segmentKey, setSearchParams]);

  const consume = useCallback(() => setTarget(null), []);

  return { target, consume };
}
