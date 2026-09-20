import type { StoryReplyInfo } from '@/api/chat';
import { parseStorySegmentKey, type StorySegment } from '@/api/stories';

export function buildStoryReplyInfo(segment: StorySegment, ownerUserId: string): StoryReplyInfo | null {
  const ref = parseStorySegmentKey(segment.key);
  if (!ref) return null;

  const info: StoryReplyInfo = {
    sourceType: ref.sourceType,
    sourceId: ref.sourceId,
    ownerUserId,
  };

  if (segment.sourceType === 'USER_STORY_ITEM') {
    info.thumbnailUrl = segment.media.thumbnailUrl;
    info.mediaUrl = segment.media.url;
    info.mediaType = segment.media.type;
  } else if (segment.sourceType === 'GAME_PHOTO') {
    info.thumbnailUrl = segment.media.thumbnailUrl;
    info.mediaUrl = segment.media.url;
    info.mediaType = 'IMAGE';
  } else if ('game' in segment) {
    // Every remaining game-backed arm (GAME_CREATED, GAME_RESULT, BRACKET_CHAMPION).
    // MONTHLY_RECAP (PRD 353) carries no game, so it falls through with no thumbnail.
    const gameThumb = segment.game.mainPhoto?.thumbnailUrl ?? segment.game.avatar ?? undefined;
    if (gameThumb) {
      info.thumbnailUrl = gameThumb;
      info.mediaType = 'IMAGE';
    }
  }

  return info;
}
